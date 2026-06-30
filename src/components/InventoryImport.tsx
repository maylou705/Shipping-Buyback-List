'use client'
import { useState } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
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
    setMessage(`${rows.length}件のデータを読み込みました。「インポート実行」を押してください。`)
  }

  const doImport = async () => {
    if (!preview.length) return
    setStatus('loading'); setMessage('インポート中...')
    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const timestamp = now.toISOString()

    // 同じ日に複数回インポートした場合は今日の分だけ削除（同日の最新版に更新）
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
