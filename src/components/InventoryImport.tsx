'use client'
import { useState, useEffect } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { createQuoteClient } from '@/lib/supabase'
import { fmt } from '@/lib/types'

interface Props {
  supabase: SupabaseClient
  onImported: () => void
}

interface InvRow {
  id: string
  stock_id: string
  stock_code: string
  product_code: string
  product_name: string
  grade: string
  qty: number
  cost: number
  arrived_at: string
}

interface InvRecord {
  product_code: string
  product_name: string
  grade: string
  qty: number
  cost: number
  imported_at: string
}

interface ProductUnit {
  short_code: string | null
  recore_pd_code: string | null
  grade: string | null
  unit_type: string
}

function parseCSV(text: string): InvRow[] {
  const lines = text.split('\n').filter(l => l.trim())
  const headers = lines[0].split(',').map(h => h.trim())
  const rows: InvRow[] = []
  const today = new Date().toISOString().split('T')[0]
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    const get = (name: string) => {
      const idx = headers.indexOf(name)
      return idx >= 0 ? (cols[idx] || '').trim() : ''
    }
    const stockId = get('在庫ID')
    if (!stockId) continue
    rows.push({
      id: `inv_${today}_${stockId}`,
      stock_id:     stockId,
      stock_code:   get('在庫コード'),
      product_code: get('商品コード'),
      product_name: get('商品名'),
      grade:        get('グレード名'),
      qty:          parseInt(get('在庫点数(販売可)(合計)')) || 0,
      cost:         parseInt(get('原価(販売可)(合計)')) || 0,
      arrived_at:   get('入庫日') || '',
    })
  }
  return rows
}

const GRADE_MAP: Record<string, string> = {
  'シュリンク有': '無印',
  'シュリンク無': 'シュリンク無',
  '★': '★シュリ',
  'その他': 'ぺリなし',
}

type Tab = 'import' | 'table' | 'trend'

export default function InventoryImport({ supabase, onImported }: Props) {
  const [tab, setTab] = useState<Tab>('table')

  // インポート用
  const [dragging, setDragging] = useState(false)
  const [status,   setStatus]   = useState<'idle'|'loading'|'done'|'error'>('idle')
  const [message,  setMessage]  = useState('')
  const [preview,  setPreview]  = useState<InvRow[]>([])
  const [unlinked, setUnlinked] = useState<{pdCode: string; name: string}[]>([])
  const [productUnits, setProductUnits] = useState<ProductUnit[]>([])

  // 在庫表用
  const [invData, setInvData] = useState<InvRecord[]>([])
  const [latestDate, setLatestDate] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [searchWord, setSearchWord] = useState('')

  // 推移用
  const [trendDates, setTrendDates] = useState<string[]>([])
  const [trendData, setTrendData] = useState<Record<string, Record<string, number>>>({})
  const [selectedPd, setSelectedPd] = useState<string>('')

  // product_unitsを取得（紐付け確認用）
  useEffect(() => {
    createQuoteClient().from('product_units')
      .select('short_code, recore_pd_code, grade, unit_type')
      .then(({ data }) => { if (data) setProductUnits(data as ProductUnit[]) })
  }, [])

  // 在庫データを取得
  const loadInventory = async () => {
    setLoading(true)
    const { data } = await supabase.from('inventory')
      .select('product_code, product_name, grade, qty, cost, imported_at')
      .order('imported_at', { ascending: false })
    if (data) {
      // 最新日付を特定
      const dates = [...new Set(data.map((r: any) => r.imported_at))].sort().reverse()
      const latest = dates[0] || ''
      setLatestDate(latest)
      setInvData(data as InvRecord[])

      // 推移データ作成
      const allDates = dates.slice(0, 14).reverse() // 最新14日分
      setTrendDates(allDates)
      const trend: Record<string, Record<string, number>> = {}
      data.forEach((r: any) => {
        const key = `${r.product_code}__${r.grade}`
        if (!trend[key]) trend[key] = {}
        trend[key][r.imported_at] = r.qty
      })
      setTrendData(trend)
    }
    setLoading(false)
  }

  useEffect(() => { loadInventory() }, [])

  // 最新在庫を商品×グレードでグループ化
  const latestInv = invData.filter(r => r.imported_at === latestDate)
  const grouped = new Map<string, { name: string; grades: {grade: string; qty: number; cost: number}[]; total: number; totalCost: number }>()
  latestInv.forEach(r => {
    const key = r.product_code
    if (!grouped.has(key)) grouped.set(key, { name: r.product_name, grades: [], total: 0, totalCost: 0 })
    const g = grouped.get(key)!
    // quote-appの省略形を取得
    const shortGrade = GRADE_MAP[r.grade] || r.grade
    const unit = productUnits.find(u => u.recore_pd_code === r.product_code && (GRADE_MAP[r.grade] === u.grade || u.grade === shortGrade))
    const displayName = unit?.short_code || r.product_name
    g.grades.push({ grade: r.grade, qty: r.qty, cost: r.cost })
    g.total += r.qty
    g.totalCost += r.cost
  })

  const filteredGroups = [...grouped.entries()].filter(([, v]) =>
    !searchWord || v.name.toLowerCase().includes(searchWord.toLowerCase())
  )

  // CSVインポート処理
  const processFile = async (file: File) => {
    if (!file.name.endsWith('.csv')) { setStatus('error'); setMessage('CSVファイルを選択してください'); return }
    setStatus('loading'); setMessage('読み込み中...')
    const text = await file.text()
    const rows = parseCSV(text)
    if (!rows.length) { setStatus('error'); setMessage('データが見つかりませんでした'); return }
    setPreview(rows)

    // 未紐付け検出
    const linkedPdSet = new Set(productUnits.filter(u => u.recore_pd_code).map(u => u.recore_pd_code))
    const unlinkedMap = new Map<string, string>()
    rows.forEach(r => {
      if (r.product_code && !linkedPdSet.has(r.product_code)) {
        unlinkedMap.set(r.product_code, r.product_name)
      }
    })
    setUnlinked([...unlinkedMap.entries()].map(([pdCode, name]) => ({ pdCode, name })))
    setStatus('done')
    setMessage(`${rows.length}件のデータを読み込みました。`)
  }

  const linkProduct = async (pdCode: string, unitId: string) => {
    await createQuoteClient().from('product_units').update({ recore_pd_code: pdCode }).eq('id', unitId)
    setUnlinked(prev => prev.filter(u => u.pdCode !== pdCode))
    setProductUnits(prev => prev.map(u => String(u.short_code) === unitId ? { ...u, recore_pd_code: pdCode } : u))
  }

  const doImport = async () => {
    if (!preview.length) return
    setStatus('loading'); setMessage('インポート中...')
    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const timestamp = now.toISOString()
    await supabase.from('inventory').delete().eq('imported_at', today)
    const chunk = 50
    for (let i = 0; i < preview.length; i += chunk) {
      const batch = preview.slice(i, i + chunk).map(r => ({ ...r, id: `inv_${today}_${r.stock_id}`, imported_at: today, created_at: timestamp }))
      const { error } = await supabase.from('inventory').insert(batch)
      if (error) { setStatus('error'); setMessage('エラー: ' + error.message); return }
    }
    setStatus('done')
    setMessage(`✓ ${preview.length}件をインポートしました！（${today}分として記録）`)
    setPreview([])
    setUnlinked([])
    await loadInventory()
    onImported()
  }

  // グレード別バッジ色
  const gradeBadge = (grade: string) => {
    const map: Record<string, {bg: string; color: string}> = {
      'シュリンク有': { bg: 'var(--ov-bg)', color: 'var(--overseas)' },
      'シュリンク無': { bg: 'var(--yam-bg)', color: 'var(--yamato)' },
      '★': { bg: '#FEF9EC', color: 'var(--warn)' },
      'その他': { bg: 'var(--sf2)', color: 'var(--text2)' },
    }
    return map[grade] || { bg: 'var(--sf2)', color: 'var(--text2)' }
  }

  const TAB_LABELS: Record<Tab, string> = { import: '📂 CSVインポート', table: '📦 在庫表', trend: '📈 推移' }

  return (
    <div>
      <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 14 }}>在庫管理</div>

      {/* タブ */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {(['table', 'trend', 'import'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '7px 16px', border: 'none', cursor: 'pointer',
            borderBottom: `2px solid ${tab === t ? 'var(--overseas)' : 'transparent'}`,
            background: 'none', fontSize: 12, fontWeight: tab === t ? 700 : 400,
            color: tab === t ? 'var(--overseas)' : 'var(--text2)',
            marginBottom: -1,
          }}>
            {TAB_LABELS[t]}
          </button>
        ))}
        {latestDate && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)', alignSelf: 'center' }}>最終更新: {latestDate}</span>}
      </div>

      {/* ━━━ 在庫表 ━━━ */}
      {tab === 'table' && (
        <div>
          {/* 検索 */}
          <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={searchWord}
              onChange={e => setSearchWord(e.target.value)}
              placeholder="商品名で検索..."
              style={{ padding: '7px 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12, width: 240, outline: 'none' }}
            />
            <span style={{ fontSize: 11, color: 'var(--text2)' }}>{filteredGroups.length}商品</span>
          </div>

          {/* サマリKPI */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10, marginBottom: 16 }}>
            {[
              { label: '商品種類', val: grouped.size + '種' },
              { label: '総在庫数', val: fmt([...grouped.values()].reduce((a, g) => a + g.total, 0)) + '個' },
              { label: '総原価', val: '¥' + fmt([...grouped.values()].reduce((a, g) => a + g.totalCost, 0)) },
            ].map(k => (
              <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', marginBottom: 3 }}>{k.label}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--overseas)' }}>{k.val}</div>
              </div>
            ))}
          </div>

          {/* 在庫テーブル */}
          {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>読み込み中...</div> : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>商品名</th>
                      <th style={{ textAlign: 'right' }}>合計在庫</th>
                      <th style={{ textAlign: 'right' }}>合計原価</th>
                      <th>グレード別内訳</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGroups.map(([pdCode, g]) => (
                      <tr key={pdCode} onClick={() => setSelectedPd(pdCode === selectedPd ? '' : pdCode)} style={{ cursor: 'pointer', background: selectedPd === pdCode ? 'var(--ov-bg)' : undefined }}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{g.name}</div>
                          <div style={{ fontSize: 10, color: 'var(--text3)' }}>{pdCode}</div>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--overseas)', fontSize: 14 }}>{fmt(g.total)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--text2)', fontSize: 12 }}>¥{fmt(g.totalCost)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {g.grades.map(gd => {
                              const { bg, color } = gradeBadge(gd.grade)
                              return (
                                <span key={gd.grade} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, background: bg, color, fontWeight: 600, whiteSpace: 'nowrap' }}>
                                  {gd.grade} {fmt(gd.qty)}
                                </span>
                              )
                            })}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ━━━ 推移グラフ ━━━ */}
      {tab === 'trend' && (
        <div>
          <div style={{ marginBottom: 12 }}>
            <select
              value={selectedPd}
              onChange={e => setSelectedPd(e.target.value)}
              style={{ padding: '7px 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12, minWidth: 280 }}
            >
              <option value="">商品を選択...</option>
              {[...grouped.entries()].map(([pdCode, g]) => (
                <option key={pdCode} value={pdCode}>{g.name}</option>
              ))}
            </select>
          </div>

          {selectedPd && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="card-head">
                <span style={{ fontWeight: 700 }}>{grouped.get(selectedPd)?.name}</span>
                <span style={{ fontSize: 11, color: 'var(--text2)' }}>過去{trendDates.length}日間の在庫推移</span>
              </div>
              <div style={{ overflowX: 'auto', padding: '14px 16px' }}>
                {/* グレード別推移テーブル */}
                <table>
                  <thead>
                    <tr>
                      <th>グレード</th>
                      {trendDates.map(d => <th key={d} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{d.slice(5)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {['シュリンク有', 'シュリンク無', '★', 'その他'].map(grade => {
                      const key = `${selectedPd}__${grade}`
                      const vals = trendDates.map(d => trendData[key]?.[d])
                      if (vals.every(v => v === undefined)) return null
                      const { bg, color } = gradeBadge(grade)
                      return (
                        <tr key={grade}>
                          <td>
                            <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 8, background: bg, color, fontWeight: 600 }}>{grade}</span>
                          </td>
                          {vals.map((v, i) => {
                            const prev = vals[i - 1]
                            const diff = v !== undefined && prev !== undefined ? v - prev : null
                            return (
                              <td key={i} style={{ textAlign: 'right', fontWeight: 600, color: v === 0 ? 'var(--danger)' : 'var(--text)' }}>
                                {v !== undefined ? fmt(v) : '—'}
                                {diff !== null && diff !== 0 && (
                                  <div style={{ fontSize: 9, color: diff > 0 ? 'var(--success)' : 'var(--danger)' }}>
                                    {diff > 0 ? '+' : ''}{fmt(diff)}
                                  </div>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!selectedPd && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)', fontSize: 12 }}>
              上のセレクトから商品を選んでください
            </div>
          )}
        </div>
      )}

      {/* ━━━ CSVインポート ━━━ */}
      {tab === 'import' && (
        <div>
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) processFile(f) }}
            style={{
              border: `2px dashed ${dragging ? 'var(--overseas)' : 'var(--border2)'}`,
              borderRadius: 'var(--radius)', padding: '40px 20px',
              textAlign: 'center', background: dragging ? 'var(--ov-bg)' : 'var(--surface)',
              cursor: 'pointer', marginBottom: 16, transition: '.15s',
            }}
            onClick={() => document.getElementById('csvInput')?.click()}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>CSVファイルをドラッグ&ドロップ</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>またはクリックしてファイルを選択</div>
            <input id="csvInput" type="file" accept=".csv" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f) }} />
          </div>

          {message && (
            <div style={{
              padding: '10px 16px', borderRadius: 'var(--radius-sm)', marginBottom: 16,
              background: status === 'error' ? '#FEF2F2' : status === 'done' ? '#EDF8F3' : 'var(--ov-bg)',
              color: status === 'error' ? 'var(--danger)' : status === 'done' ? 'var(--success)' : 'var(--overseas)',
              border: `1px solid ${status === 'error' ? '#FACACA' : status === 'done' ? '#AADDC2' : 'var(--ov-bd)'}`,
              fontSize: 12, fontWeight: 700,
            }}>
              {status === 'loading' && '⏳ '}{message}
            </div>
          )}

          {/* 未紐付け */}
          {unlinked.length > 0 && (
            <div className="card" style={{ marginBottom: 16, borderColor: 'var(--dhl-bd)' }}>
              <div className="card-head" style={{ background: 'var(--dhl-bg)', color: 'var(--dhl)' }}>
                ⚠ 未紐付け商品（{unlinked.length}件）
              </div>
              {unlinked.map(({ pdCode, name }) => (
                <div key={pdCode} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>{pdCode}</div>
                  </div>
                  <select defaultValue="" onChange={e => { if (e.target.value) linkProduct(pdCode, e.target.value) }}
                    style={{ fontSize: 12, padding: '6px 10px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', minWidth: 220 }}>
                    <option value="">マスター商品を選択...</option>
                    {productUnits.filter(u => u.short_code).map((u, idx) => (
                      <option key={idx} value={String(idx)}>{u.short_code} ({u.unit_type} / {u.grade})</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          {preview.length > 0 && (
            <button onClick={doImport} style={{
              padding: '10px 28px', background: 'var(--overseas)', color: '#fff',
              border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13,
              fontWeight: 800, cursor: 'pointer', marginBottom: 20,
            }}>
              インポート実行 ({preview.length}件)
            </button>
          )}

          {preview.length > 0 && (
            <div className="card">
              <div className="card-head">プレビュー（最初の10件）</div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead><tr>
                    <th>商品コード</th><th>商品名</th><th>グレード</th>
                    <th style={{ textAlign: 'right' }}>在庫数</th>
                    <th style={{ textAlign: 'right' }}>原価</th>
                  </tr></thead>
                  <tbody>
                    {preview.slice(0, 10).map(r => (
                      <tr key={r.id}>
                        <td style={{ fontSize: 10, color: 'var(--text2)' }}>{r.product_code}</td>
                        <td style={{ fontWeight: 600 }}>{r.product_name}</td>
                        <td>{r.grade}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--overseas)' }}>{r.qty}</td>
                        <td style={{ textAlign: 'right' }}>¥{fmt(r.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
