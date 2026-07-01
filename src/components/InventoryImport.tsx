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
          {/* 検索＋KPI */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <input
              value={searchWord}
              onChange={e => setSearchWord(e.target.value)}
              placeholder="商品名で検索..."
              style={{ padding: '7px 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12, width: 220, outline: 'none' }}
            />
            <span style={{ fontSize: 11, color: 'var(--text2)', background: 'var(--sf2)', padding: '4px 10px', borderRadius: 8 }}>
              {filteredRows.length}商品
            </span>
            <span style={{ fontSize: 11, color: 'var(--text2)', background: 'var(--sf2)', padding: '4px 10px', borderRadius: 8 }}>
              総在庫 <strong style={{ color: 'var(--overseas)' }}>{fmt(allRows.reduce((a, r) => a + Object.values(r.gradeQty).reduce((b, q) => b + q, 0), 0))}</strong>個
            </span>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>読み込み中...</div>
          ) : (
            categories.map(cat => {
              const catRows = filteredRows.filter(r => r.category === cat)
              if (!catRows.length) return null
              return (
                <div key={cat} style={{ marginBottom: 28 }}>
                  {/* カテゴリ見出し */}
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', padding: '6px 12px', background: 'var(--sf2)', borderRadius: 'var(--radius-sm)', marginBottom: 6, borderLeft: '3px solid var(--overseas)' }}>
                    {cat} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text2)', marginLeft: 6 }}>{catRows.length}商品</span>
                  </div>

                  {/* グリッドテーブル */}
                  <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 600 }}>
                        <thead>
                          <tr style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                            {/* 商品名列 */}
                            <th style={{
                              position: 'sticky', top: 0, left: 0, zIndex: 20,
                              background: '#1e293b', color: '#fff',
                              padding: '10px 14px', textAlign: 'left',
                              fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap',
                              minWidth: 200, borderRight: '2px solid #334155',
                            }}>
                              商品名
                            </th>
                            {GRADE_COLS.map(c => (
                              <th key={c.key} style={{
                                position: 'sticky', top: 0, zIndex: 10,
                                background: '#1e293b', color: '#fff',
                                padding: '10px 16px', textAlign: 'right',
                                fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap',
                                minWidth: 90, borderRight: '1px solid #334155',
                              }}>
                                {c.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {catRows.map((r, idx) => (
                            <tr key={r.productId} style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                              {/* 商品名（左固定なし、スクロールで流れる） */}
                              <td style={{
                                padding: '9px 14px',
                                borderRight: '2px solid var(--border)',
                                borderBottom: '1px solid var(--border)',
                                background: idx % 2 === 0 ? '#fff' : '#f8fafc',
                                minWidth: 200,
                              }}>
                                <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text)', whiteSpace: 'nowrap' }}>{r.name}</div>
                                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>{r.name_en}</div>
                              </td>
                              {GRADE_COLS.map(c => {
                                const qty = r.gradeQty[c.key]
                                const hasQty = qty !== undefined && qty > 0
                                const isZero = qty === 0
                                return (
                                  <td key={c.key} style={{
                                    padding: '9px 16px',
                                    textAlign: 'right',
                                    borderRight: '1px solid var(--border)',
                                    borderBottom: '1px solid var(--border)',
                                    background: hasQty
                                      ? idx % 2 === 0 ? '#f0f9ff' : '#e0f2fe'
                                      : idx % 2 === 0 ? '#fff' : '#f8fafc',
                                    fontWeight: hasQty ? 700 : 400,
                                    color: hasQty ? 'var(--overseas)' : isZero ? '#ef4444' : 'var(--text3)',
                                    fontSize: hasQty ? 13 : 12,
                                  }}>
                                    {qty !== undefined ? fmt(qty) : '—'}
                                  </td>
                                )
                              })}
                            </tr>
                          ))}
                          {/* 合計行 */}
                          <tr style={{ background: '#1e293b' }}>
                            <td style={{ padding: '8px 14px', borderRight: '2px solid #334155', color: '#94a3b8', fontSize: 11, fontWeight: 700 }}>
                              合計
                            </td>
                            {GRADE_COLS.map(c => {
                              const total = catRows.reduce((a, r) => a + (r.gradeQty[c.key] || 0), 0)
                              return (
                                <td key={c.key} style={{
                                  padding: '8px 16px', textAlign: 'right',
                                  borderRight: '1px solid #334155',
                                  color: total > 0 ? '#7dd3fc' : '#475569',
                                  fontWeight: 700, fontSize: 12,
                                }}>
                                  {total > 0 ? fmt(total) : '—'}
                                </td>
                              )
                            })}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
