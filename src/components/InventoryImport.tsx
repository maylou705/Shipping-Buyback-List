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
  id: string; stock_id: string; stock_code: string
  product_code: string; product_name: string; grade: string
  qty: number; cost: number; arrived_at: string
}

interface InvRecord {
  product_code: string; product_name: string; grade: string
  qty: number; cost: number; imported_at: string
}

interface ProductUnit {
  id: number
  short_code: string | null
  recore_pd_code: string | null
  grade: string | null
  unit_type: string
  product_id: number
}

interface Product {
  id: number
  name: string
  name_en: string
  category: string
}

// リコアグレード → quote-appグレード
const GRADE_MAP: Record<string, string> = {
  'シュリンク有': '無印',
  'シュリンク無': 'シュリンク無',
  '★': '★シュリ',
  'その他': 'ぺリなし',
}

// 列の定義
const GRADE_COLS = [
  { key: 'シュリンク有', label: 'シュリンク有' },
  { key: 'シュリンク無', label: 'シュリンク無' },
  { key: '★',           label: '★シュリ' },
  { key: 'その他',       label: 'ぺリなし' },
  { key: 'CASE',        label: 'CASE' },
]

function parseCSV(text: string): InvRow[] {
  const lines = text.split('\n').filter(l => l.trim())
  const headers = lines[0].split(',').map(h => h.trim())
  const rows: InvRow[] = []
  const today = new Date().toISOString().split('T')[0]
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    const get = (name: string) => { const idx = headers.indexOf(name); return idx >= 0 ? (cols[idx] || '').trim() : '' }
    const stockId = get('在庫ID')
    if (!stockId) continue
    rows.push({
      id: `inv_${today}_${stockId}`,
      stock_id: stockId, stock_code: get('在庫コード'),
      product_code: get('商品コード'), product_name: get('商品名'),
      grade: get('グレード名'),
      qty: parseInt(get('在庫点数(販売可)(合計)')) || 0,
      cost: parseInt(get('原価(販売可)(合計)')) || 0,
      arrived_at: get('入庫日') || '',
    })
  }
  return rows
}

type Tab = 'table' | 'trend' | 'import'

export default function InventoryImport({ supabase, onImported }: Props) {
  const [tab, setTab] = useState<Tab>('table')

  // マスタ
  const [productUnits, setProductUnits] = useState<ProductUnit[]>([])
  const [products, setProducts] = useState<Product[]>([])

  // 在庫
  const [invData, setInvData] = useState<InvRecord[]>([])
  const [latestDate, setLatestDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [searchWord, setSearchWord] = useState('')

  // 推移
  const [trendDates, setTrendDates] = useState<string[]>([])
  const [trendData, setTrendData] = useState<Record<string, Record<string, number>>>({})
  const [selectedPd, setSelectedPd] = useState('')

  // インポート
  const [dragging, setDragging] = useState(false)
  const [status, setStatus] = useState<'idle'|'loading'|'done'|'error'>('idle')
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState<InvRow[]>([])
  const [unlinked, setUnlinked] = useState<{pdCode: string; name: string}[]>([])

  // quote-appからマスタ取得
  useEffect(() => {
    const quote = createQuoteClient()
    quote.from('product_units').select('id, short_code, recore_pd_code, grade, unit_type, product_id')
      .then(({ data }) => { if (data) setProductUnits(data as ProductUnit[]) })
    quote.from('products').select('id, name, name_en, category')
      .then(({ data }) => { if (data) setProducts(data as Product[]) })
  }, [])

  // 在庫データ取得
  const loadInventory = async () => {
    setLoading(true)
    const { data } = await supabase.from('inventory')
      .select('product_code, product_name, grade, qty, cost, imported_at')
      .order('imported_at', { ascending: false })
    if (data) {
      const dates = [...new Set((data as InvRecord[]).map(r => r.imported_at))].sort().reverse()
      setLatestDate(dates[0] || '')
      setInvData(data as InvRecord[])
      const allDates = dates.slice(0, 14).reverse()
      setTrendDates(allDates)
      const trend: Record<string, Record<string, number>> = {}
      ;(data as InvRecord[]).forEach(r => {
        const key = `${r.product_code}__${r.grade}`
        if (!trend[key]) trend[key] = {}
        trend[key][r.imported_at] = r.qty
      })
      setTrendData(trend)
    }
    setLoading(false)
  }

  useEffect(() => { loadInventory() }, [])

  // 在庫表データ構築
  // recore_pd_codeが設定されているproduct_unitsのみ対象
  const linkedUnits = productUnits.filter(u => u.recore_pd_code)

  // product_idでproductsと結合、カテゴリでグループ化
  interface TableRow {
    productId: number
    name: string
    name_en: string
    category: string
    gradeQty: Record<string, number> // リコアのgrade → qty
  }

  const tableRows: TableRow[] = []
  const latestInv = invData.filter(r => r.imported_at === latestDate)

  // product単位でまとめる
  const productMap = new Map<number, TableRow>()
  linkedUnits.forEach(u => {
    const product = products.find(p => p.id === u.product_id)
    if (!product) return
    if (!productMap.has(product.id)) {
      productMap.set(product.id, {
        productId: product.id,
        name: product.name,
        name_en: product.name_en || '',
        category: product.category || 'その他',
        gradeQty: {},
      })
    }
    // このunitのrecore_pd_codeとgradeで在庫を探す
    if (u.recore_pd_code) {
      const invRow = latestInv.find(r => r.product_code === u.recore_pd_code && GRADE_MAP[r.grade] === u.grade)
      if (invRow && invRow.qty > 0) {
        const row = productMap.get(product.id)!
        row.gradeQty[invRow.grade] = (row.gradeQty[invRow.grade] || 0) + invRow.qty
      }
    }
  })

  // 在庫がある商品のみ表示
  const allRows = [...productMap.values()].filter(r => Object.values(r.gradeQty).some(q => q > 0))

  // 検索フィルタ
  const filteredRows = allRows.filter(r =>
    !searchWord ||
    r.name.toLowerCase().includes(searchWord.toLowerCase()) ||
    r.name_en.toLowerCase().includes(searchWord.toLowerCase())
  )

  // カテゴリでグループ化
  const categories = [...new Set(filteredRows.map(r => r.category))].sort()

  // インポート処理
  const processFile = async (file: File) => {
    if (!file.name.endsWith('.csv')) { setStatus('error'); setMessage('CSVファイルを選択してください'); return }
    setStatus('loading'); setMessage('読み込み中...')
    const text = await file.text()
    const rows = parseCSV(text)
    if (!rows.length) { setStatus('error'); setMessage('データが見つかりませんでした'); return }
    setPreview(rows)
    const linkedPdSet = new Set(linkedUnits.map(u => u.recore_pd_code))
    const unlinkedMap = new Map<string, string>()
    rows.forEach(r => { if (r.product_code && !linkedPdSet.has(r.product_code)) unlinkedMap.set(r.product_code, r.product_name) })
    setUnlinked([...unlinkedMap.entries()].map(([pdCode, name]) => ({ pdCode, name })))
    setStatus('done')
    setMessage(`${rows.length}件のデータを読み込みました。`)
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
    setStatus('done'); setMessage(`✓ ${preview.length}件をインポートしました！（${today}分として記録）`)
    setPreview([]); setUnlinked([])
    await loadInventory(); onImported()
  }

  const TAB_LABELS: Record<Tab, string> = { table: '📦 在庫表', trend: '📈 推移', import: '📂 CSVインポート' }

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
            color: tab === t ? 'var(--overseas)' : 'var(--text2)', marginBottom: -1,
          }}>
            {TAB_LABELS[t]}
          </button>
        ))}
        {latestDate && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)', alignSelf: 'center' }}>最終更新: {latestDate}</span>}
      </div>

      {/* ━━━ 在庫表 ━━━ */}
      {tab === 'table' && (
        <div>
          <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={searchWord} onChange={e => setSearchWord(e.target.value)}
              placeholder="商品名で検索..." style={{ padding: '7px 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12, width: 240, outline: 'none' }} />
            <span style={{ fontSize: 11, color: 'var(--text2)' }}>{filteredRows.length}商品</span>
          </div>

          {/* KPI */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10, marginBottom: 16 }}>
            {[
              { label: '商品種類', val: allRows.length + '種', color: 'var(--overseas)' },
              { label: '総在庫数', val: fmt(allRows.reduce((a, r) => a + Object.values(r.gradeQty).reduce((b, q) => b + q, 0), 0)) + '個', color: 'var(--overseas)' },
            ].map(k => (
              <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', marginBottom: 3 }}>{k.label}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: k.color }}>{k.val}</div>
              </div>
            ))}
          </div>

          {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>読み込み中...</div> : (
            categories.map(cat => {
              const catRows = filteredRows.filter(r => r.category === cat)
              return (
                <div key={cat} className="card" style={{ marginBottom: 14, padding: 0, overflow: 'hidden' }}>
                  <div className="card-head" style={{ background: 'var(--sf2)' }}>
                    <span style={{ fontWeight: 800 }}>{cat}</span>
                    <span style={{ fontSize: 11, color: 'var(--text2)' }}>{catRows.length}商品</span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table>
                      <thead>
                        <tr>
                          <th style={{ minWidth: 180 }}>商品名</th>
                          {GRADE_COLS.map(c => <th key={c.key} style={{ textAlign: 'right', whiteSpace: 'nowrap', width: 100 }}>{c.label}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {catRows.map(r => {
                          return (
                            <tr key={r.productId}>
                              <td style={{ minWidth: 200 }}>
                                <div style={{ fontWeight: 600, fontSize: 12 }}>{r.name}</div>
                                <div style={{ fontSize: 10, color: 'var(--text3)' }}>{r.name_en}</div>
                              </td>
                              {GRADE_COLS.map(c => {
                                const qty = r.gradeQty[c.key]
                                return (
                                  <td key={c.key} style={{ textAlign: 'right', width: 100, fontWeight: qty ? 700 : 400, color: qty ? 'var(--overseas)' : 'var(--text3)', fontSize: 13 }}>
                                    {qty !== undefined ? fmt(qty) : '—'}
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
              )
            })
          )}
        </div>
      )}

      {/* ━━━ 推移 ━━━ */}
      {tab === 'trend' && (
        <div>
          <div style={{ marginBottom: 12 }}>
            <select value={selectedPd} onChange={e => setSelectedPd(e.target.value)}
              style={{ padding: '7px 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12, minWidth: 280 }}>
              <option value="">商品を選択...</option>
              {allRows.map(r => <option key={r.productId} value={String(r.productId)}>{r.name}</option>)}
            </select>
          </div>

          {selectedPd && (() => {
            const row = allRows.find(r => String(r.productId) === selectedPd)
            if (!row) return null
            // このproductに紐づくrecore_pd_codesを取得
            const units = linkedUnits.filter(u => u.product_id === row.productId)
            return (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="card-head">
                  <span style={{ fontWeight: 700 }}>{row.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text2)' }}>過去{trendDates.length}日間</span>
                </div>
                <div style={{ overflowX: 'auto', padding: '14px 16px' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>グレード</th>
                        {trendDates.map(d => <th key={d} style={{ textAlign: 'right', whiteSpace: 'nowrap', fontSize: 10 }}>{d.slice(5)}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {units.map(u => {
                        const recoreGrade = Object.entries(GRADE_MAP).find(([, v]) => v === u.grade)?.[0]
                        if (!recoreGrade || !u.recore_pd_code) return null
                        const key = `${u.recore_pd_code}__${recoreGrade}`
                        const vals = trendDates.map(d => trendData[key]?.[d])
                        if (vals.every(v => v === undefined)) return null
                        return (
                          <tr key={u.id}>
                            <td>
                              <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 8, background: 'var(--ov-bg)', color: 'var(--overseas)', fontWeight: 600 }}>
                                {u.short_code || u.grade}
                              </span>
                            </td>
                            {vals.map((v, i) => {
                              const prev = vals[i - 1]
                              const diff = v !== undefined && prev !== undefined ? v - prev : null
                              return (
                                <td key={i} style={{ textAlign: 'right', fontWeight: 600, color: v === 0 ? 'var(--danger)' : 'var(--text)', fontSize: 12 }}>
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
            )
          })()}

          {!selectedPd && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)', fontSize: 12 }}>上のセレクトから商品を選んでください</div>}
        </div>
      )}

      {/* ━━━ CSVインポート ━━━ */}
      {tab === 'import' && (
        <div>
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) processFile(f) }}
            style={{ border: `2px dashed ${dragging ? 'var(--overseas)' : 'var(--border2)'}`, borderRadius: 'var(--radius)', padding: '40px 20px', textAlign: 'center', background: dragging ? 'var(--ov-bg)' : 'var(--surface)', cursor: 'pointer', marginBottom: 16, transition: '.15s' }}
            onClick={() => document.getElementById('csvInput')?.click()}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>CSVファイルをドラッグ&ドロップ</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>またはクリックしてファイルを選択</div>
            <input id="csvInput" type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f) }} />
          </div>

          {message && (
            <div style={{ padding: '10px 16px', borderRadius: 'var(--radius-sm)', marginBottom: 16, background: status === 'error' ? '#FEF2F2' : status === 'done' ? '#EDF8F3' : 'var(--ov-bg)', color: status === 'error' ? 'var(--danger)' : status === 'done' ? 'var(--success)' : 'var(--overseas)', border: `1px solid ${status === 'error' ? '#FACACA' : status === 'done' ? '#AADDC2' : 'var(--ov-bd)'}`, fontSize: 12, fontWeight: 700 }}>
              {status === 'loading' && '⏳ '}{message}
            </div>
          )}

          {unlinked.length > 0 && (
            <div className="card" style={{ marginBottom: 16, borderColor: 'var(--dhl-bd)' }}>
              <div className="card-head" style={{ background: 'var(--dhl-bg)', color: 'var(--dhl)' }}>⚠ 未紐付け商品（{unlinked.length}件）</div>
              {unlinked.map(({ pdCode, name }) => (
                <div key={pdCode} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>{pdCode}</div>
                  </div>
                  <select defaultValue="" onChange={async e => {
                    if (!e.target.value) return
                    const unit = linkedUnits[parseInt(e.target.value)]
                    if (unit) await createQuoteClient().from('product_units').update({ recore_pd_code: pdCode }).eq('id', unit.id)
                    setUnlinked(prev => prev.filter(u => u.pdCode !== pdCode))
                  }} style={{ fontSize: 12, padding: '6px 10px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', minWidth: 280 }}>
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
            <button onClick={doImport} style={{ padding: '10px 28px', background: 'var(--overseas)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 800, cursor: 'pointer', marginBottom: 20 }}>
              インポート実行 ({preview.length}件)
            </button>
          )}

          {preview.length > 0 && (
            <div className="card">
              <div className="card-head">プレビュー（最初の10件）</div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead><tr><th>商品コード</th><th>商品名</th><th>グレード</th><th style={{ textAlign: 'right' }}>在庫数</th><th style={{ textAlign: 'right' }}>原価</th></tr></thead>
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
