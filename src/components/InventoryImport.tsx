'use client'
import { useState, useEffect } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { createEcClient } from '@/lib/supabase'
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

interface PC { id: number | string; code: string; name: string; product_code: string | null }

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

export default function InventoryImport({ supabase, onImported }: Props) {
  const [dragging, setDragging] = useState(false)
  const [status,   setStatus]   = useState<'idle'|'loading'|'done'|'error'>('idle')
  const [message,  setMessage]  = useState('')
  const [preview,  setPreview]  = useState<InvRow[]>([])
  const [productCodes, setProductCodes] = useState<PC[]>([])
  const [linkMap, setLinkMap] = useState<Record<string, string>>({}) // product_code(PD..) -> product_codes.id

  useEffect(() => {
    createEcClient().from('product_codes').select('id, code, name, product_code').then(({ data }) => {
      if (data) setProductCodes(data)
    })
  }, [])

  const processFile = async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setStatus('error'); setMessage('CSVファイルを選択してください'); return
    }
    setStatus('loading'); setMessage('読み込み中...')
    const text = await file.text()
    const rows = parseCSV(text)
    if (!rows.length) {
      setStatus('error'); setMessage('データが見つかりませんでした'); return
    }
    setPreview(rows)
    setStatus('done')
    setMessage(`${rows.length}件のデータを読み込みました。`)
  }

  // 未紐付け商品コード一覧（重複除去・商品名つき）
  const linkedPdSet = new Set(productCodes.filter(p => p.product_code).map(p => p.product_code))
  const unlinkedMap = new Map<string, string>() // pdCode -> productName
  preview.forEach(r => {
    if (r.product_code && !linkedPdSet.has(r.product_code) && !linkMap[r.product_code]) {
      unlinkedMap.set(r.product_code, r.product_name)
    }
  })
  const unlinked = [...unlinkedMap.entries()]

  const linkProduct = async (pdCode: string, pcId: string | number) => {
    await createEcClient().from('product_codes').update({ product_code: pdCode }).eq('id', pcId)
    setLinkMap(p => ({ ...p, [pdCode]: String(pcId) }))
    // ローカルのproductCodesも更新
    setProductCodes(prev => prev.map(p => p.id === pcId ? { ...p, product_code: pdCode } : p))
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
      const batch = preview.slice(i, i + chunk).map(r => ({
        ...r,
        id: `inv_${today}_${r.stock_id}`,
        imported_at: today,
        created_at: timestamp,
      }))
      const { error } = await supabase.from('inventory').insert(batch)
      if (error) {
        setStatus('error'); setMessage('エラー: ' + error.message); return
      }
    }
    setStatus('done')
    setMessage(`✓ ${preview.length}件をインポートしました！（${today}分として記録）`)
    setPreview([])
    onImported()
  }

  return (
    <div>
      <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 16 }}>在庫インポート</div>

      {/* ドロップゾーン */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault(); setDragging(false)
          const file = e.dataTransfer.files[0]
          if (file) processFile(file)
        }}
        style={{
          border: `2px dashed ${dragging ? 'var(--overseas)' : 'var(--border2)'}`,
          borderRadius: 'var(--radius)', padding: '40px 20px',
          textAlign: 'center', background: dragging ? 'var(--ov-bg)' : 'var(--surface)',
          cursor: 'pointer', marginBottom: 16, transition: '.15s',
        }}
        onClick={() => document.getElementById('csvInput')?.click()}
      >
        <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
          CSVファイルをドラッグ&ドロップ
        </div>
        <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>
          またはクリックしてファイルを選択
        </div>
        <input id="csvInput" type="file" accept=".csv" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f) }} />
      </div>

      {/* ステータス */}
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

      {/* 未紐付け商品の警告＆紐付けUI */}
      {unlinked.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderColor: 'var(--dhl-bd)' }}>
          <div className="card-head" style={{ background: 'var(--dhl-bg)', color: 'var(--dhl)' }}>
            ⚠ 未紐付け商品（{unlinked.length}件） — マスターと紐付けてください
          </div>
          <div style={{ padding: 0 }}>
            {unlinked.map(([pdCode, name]) => (
              <div key={pdCode} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>{pdCode}</div>
                </div>
                <select
                  defaultValue=""
                  onChange={e => { if (e.target.value) linkProduct(pdCode, e.target.value) }}
                  style={{ fontSize: 12, padding: '6px 10px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', minWidth: 220 }}
                >
                  <option value="">マスター商品を選択して紐付け...</option>
                  {productCodes.map(p => (
                    <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* インポートボタン */}
      {preview.length > 0 && (
        <button onClick={doImport} style={{
          padding: '10px 28px', background: 'var(--overseas)', color: '#fff',
          border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13,
          fontWeight: 800, cursor: 'pointer', marginBottom: 20,
        }}>
          インポート実行 ({preview.length}件)
        </button>
      )}

      {/* プレビュー */}
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
  )
}
