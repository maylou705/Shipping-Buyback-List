'use client'
import { useState, useEffect } from 'react'
import { Inbound, InbSection, INB_SECTION_LABEL, fmt } from '@/lib/types'
import { SupabaseClient } from '@supabase/supabase-js'
import { createQuoteClient } from '@/lib/supabase'

interface Props {
  supabase: SupabaseClient
  date: string
  setDate?: (d: string) => void
  inbounds: Inbound[]
  reload: () => void
}

const SEC_COLOR: Record<InbSection, string> = { corporate: 'var(--yamato)', purchase: 'var(--inbound)', postal: 'var(--overseas)' }
const SEC_BG:    Record<InbSection, string> = { corporate: 'var(--yam-bg)', purchase: 'var(--inb-bg)',  postal: 'var(--ov-bg)' }

interface EntryRow {
  company: string
  product_name: string
  qty: string
  unit_price: string
  tracking_no: string
  payment_date: string
  remarks: string
}

function inputStyle(extra?: React.CSSProperties): React.CSSProperties {
  return { width: '100%', fontSize: 12, padding: '3px 5px', background: '#fff', border: '1px solid #D8C270', borderRadius: 3, outline: 'none', color: '#333', ...extra }
}

export default function InboundInput({ supabase, date, setDate, inbounds, reload }: Props) {
  const [products, setProducts] = useState<{ code: string; name: string; recore_pd_code?: string | null; grade?: string; unit_type?: string }[]>([])
  const [prodSearch, setProdSearch] = useState('')
  const [showSuggest, setShowSuggest] = useState(false)
  const [inventoryByPd, setInventoryByPd] = useState<Record<string, number>>({})

  useEffect(() => {
    const quote = createQuoteClient()
    quote.from('product_units').select('id, product_id, unit_type, short_code, grade, recore_pd_code').then(({ data: units, error }) => {
      if (error) { console.error('product_units load error', error); return }
      if (units) {
        setProducts(units.filter((u: any) => u.short_code).map((u: any) => ({
          code: u.short_code, name: u.short_code, recore_pd_code: u.recore_pd_code, grade: u.grade, unit_type: u.unit_type,
        })))
      }
    })
    supabase.from('inventory').select('product_code, grade, qty').then(({ data: inv }) => {
      if (inv) {
        const m: Record<string, number> = {}
        inv.forEach((r: any) => { const k = `${r.product_code}__${r.grade}`; m[k] = (m[k] || 0) + r.qty })
        setInventoryByPd(m)
      }
    })
  }, [supabase])

  const getInventory = (code: string): number | undefined => {
    const unit = products.find(p => p.code === code) as any
    if (!unit?.recore_pd_code) return undefined
    const gradeMap: Record<string, string> = { '無印': 'シュリンク有', 'シュリンク無': 'シュリンク無', '★シュリ': '★', 'ぺリなし': 'その他' }
    const key = `${unit.recore_pd_code}__${gradeMap[unit.grade] || unit.grade}`
    return inventoryByPd[key]
  }

  const filtered = showSuggest && prodSearch.length >= 1
    ? products.filter(p => p.code.toLowerCase().includes(prodSearch.toLowerCase()) || p.name.toLowerCase().includes(prodSearch.toLowerCase())).slice(0, 8)
    : []

  const [section, setSection] = useState<InbSection>('corporate')
  const col = SEC_COLOR[section]
  const CELL: React.CSSProperties = { border: `1px solid ${col}`, padding: '4px 6px', fontSize: 12 }
  const TH: React.CSSProperties = { ...CELL, background: col, fontWeight: 700, textAlign: 'left', whiteSpace: 'nowrap', color: '#fff' }
  const TABLE_BG = SEC_BG[section]

  const di = inbounds.filter(b => b.date === date)
  const secRows = di.filter(x => x.inb_section === section)
  const tIn = di.reduce((a, b) => a + (b.amount || 0), 0)

  const blankEntry = (carryFrom?: EntryRow): EntryRow => ({
    company: carryFrom?.company || '',
    product_name: '', qty: '', unit_price: '',
    tracking_no: carryFrom?.tracking_no || '',
    payment_date: carryFrom?.payment_date || '',
    remarks: carryFrom?.remarks || '',
  })

  const [entry, setEntry] = useState<EntryRow>(() => blankEntry())
  const [saving, setSaving] = useState(false)

  // 区分・日付が変わったら入力欄をリセット
  useEffect(() => {
    setEntry(blankEntry())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, date])

  const patchEntry = (patch: Partial<EntryRow>) => setEntry(prev => ({ ...prev, ...patch }))

  const confirmEntry = async () => {
    if (!entry.product_name.trim()) { alert('商品名を入力してください'); return }
    if (section === 'postal' && !entry.tracking_no.trim()) { alert('郵送買取は問番が必須です'); return }
    if (saving) return
    setSaving(true)
    const qty = +entry.qty || 0
    const unit_price = +entry.unit_price || 0
    await supabase.from('inbounds').insert({
      date, inb_section: section, arrived: false, chk_liqoa: false,
      company: entry.company, product_name: entry.product_name.trim(),
      qty, unit_price, amount: qty * unit_price,
      tracking_no: entry.tracking_no, payment_date: entry.payment_date || null,
      remarks: entry.remarks, recore_no: '',
    })
    setEntry(blankEntry(entry))
    setSaving(false)
    setShowSuggest(false)
    reload()
  }

  const handleEntryKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !showSuggest) {
      e.preventDefault()
      confirmEntry()
    }
  }

  const updateRow = async (id: string, patch: Record<string, any>) => {
    await supabase.from('inbounds').update(patch).eq('id', id)
    reload()
  }
  const delRow = async (id: string) => {
    if (!confirm('この行を削除しますか？')) return
    await supabase.from('inbounds').delete().eq('id', id)
    reload()
  }

  return (
    <div style={{ padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
        <div className="fg" style={{ maxWidth: 170 }}>
          <label>日付</label>
          <input type="date" value={date} onChange={e => setDate?.(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {(['corporate', 'purchase', 'postal'] as InbSection[]).map(sec => (
            <button key={sec} onClick={() => setSection(sec)} style={{
              padding: '7px 18px', borderRadius: 'var(--radius-sm)',
              border: `1.5px solid ${section === sec ? SEC_COLOR[sec] : 'var(--border)'}`,
              background: section === sec ? SEC_BG[sec] : 'var(--surface)',
              color: section === sec ? SEC_COLOR[sec] : 'var(--text2)',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>
              {INB_SECTION_LABEL[sec]}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 800, color: 'var(--inbound)' }}>
          本日合計 ¥{fmt(tIn)}（{di.length}件）
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
        <span>◀</span> 表は横にスクロールできます（すべての項目は右側まで続いています） <span>▶</span>
      </div>
      <div style={{ overflowX: 'auto', border: `1px solid ${col}`, borderRadius: 'var(--radius-sm)' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', background: TABLE_BG }}>
          <thead>
            <tr>
              <th style={{ ...TH, minWidth: 120, position: 'sticky', left: 0, zIndex: 2 }}>{section === 'corporate' ? '会社名' : '買取者名'}</th>
              <th style={{ ...TH, minWidth: 200 }}>商品名</th>
              <th style={{ ...TH, textAlign: 'right' }}>個数</th>
              <th style={{ ...TH, textAlign: 'right' }}>単価</th>
              <th style={{ ...TH, textAlign: 'right' }}>金額</th>
              <th style={TH}>問番{section === 'postal' && <span style={{ color: '#ffe0e0' }}> *</span>}</th>
              <th style={TH}>支払日</th>
              <th style={{ ...TH, minWidth: 140 }}>備考</th>
              <th style={{ ...TH, width: 1 }}></th>
            </tr>
          </thead>
          <tbody>
            {!secRows.length && (
              <tr>
                <td colSpan={9} style={{ ...CELL, textAlign: 'center', color: 'var(--text3)', padding: '14px' }}>
                  まだ確定した商品はありません。下の入力欄から追加してください。
                </td>
              </tr>
            )}
            {secRows.map(x => (
              <tr key={x.id}>
                <td style={{ ...CELL, position: 'sticky', left: 0, zIndex: 1, background: TABLE_BG }}><input defaultValue={x.company} onBlur={e => e.target.value !== x.company && updateRow(x.id, { company: e.target.value })} style={inputStyle()} /></td>
                <td style={CELL}><input defaultValue={x.product_name} onBlur={e => e.target.value !== x.product_name && updateRow(x.id, { product_name: e.target.value })} style={inputStyle()} /></td>
                <td style={CELL}>
                  <input type="number" defaultValue={x.qty} onBlur={e => { const qty = +e.target.value || 0; if (qty !== x.qty) updateRow(x.id, { qty, amount: qty * (x.unit_price || 0) }) }} style={inputStyle({ textAlign: 'right' })} />
                </td>
                <td style={CELL}>
                  <input type="number" defaultValue={x.unit_price} onBlur={e => { const up = +e.target.value || 0; if (up !== x.unit_price) updateRow(x.id, { unit_price: up, amount: (x.qty || 0) * up }) }} style={inputStyle({ textAlign: 'right' })} />
                </td>
                <td style={{ ...CELL, textAlign: 'right', fontWeight: 700, color: SEC_COLOR[x.inb_section] }}>¥{fmt(x.amount)}</td>
                <td style={CELL}><input defaultValue={x.tracking_no} onBlur={e => e.target.value !== x.tracking_no && updateRow(x.id, { tracking_no: e.target.value })} style={inputStyle()} /></td>
                <td style={CELL}><input type="date" defaultValue={x.payment_date} onChange={e => e.target.value !== x.payment_date && updateRow(x.id, { payment_date: e.target.value || null })} style={inputStyle()} /></td>
                <td style={CELL}><input defaultValue={x.remarks} onBlur={e => e.target.value !== x.remarks && updateRow(x.id, { remarks: e.target.value })} style={inputStyle()} /></td>
                <td style={{ ...CELL, textAlign: 'center' }}>
                  <button onClick={() => delRow(x.id)} style={{ fontSize: 10, padding: '1px 5px', border: '1px solid #D8C270', borderRadius: 3, background: '#fff', cursor: 'pointer', color: '#a33' }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 入力欄（常に1行・確定ボタンで追加） */}
      <div style={{ marginTop: 16, background: TABLE_BG, border: `2px solid ${col}`, borderRadius: 'var(--radius)', padding: '12px 14px' }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: col, marginBottom: 10 }}>
          ＋ 新しい商品を入力
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 8, marginBottom: 8 }} onKeyDown={handleEntryKeyDown}>
          <div className="fg">
            <label>{section === 'corporate' ? '会社名' : '買取者名'}</label>
            <input value={entry.company} onChange={e => patchEntry({ company: e.target.value })} style={inputStyle()} />
          </div>
          <div className="fg" style={{ position: 'relative', gridColumn: 'span 2' }}>
            <label>商品名</label>
            <input
              value={entry.product_name}
              onChange={e => { patchEntry({ product_name: e.target.value }); setProdSearch(e.target.value); setShowSuggest(true) }}
              onFocus={e => { setProdSearch(e.target.value); setShowSuggest(true) }}
              placeholder="商品名またはコードで検索…"
              style={inputStyle()}
            />
            {showSuggest && filtered.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, minWidth: 420, background: 'var(--surface)', border: '1.5px solid var(--inbound)', borderRadius: 'var(--radius-sm)', zIndex: 1000, boxShadow: '0 4px 12px rgba(0,0,0,.1)', maxHeight: 320, overflowY: 'auto' }}>
                {filtered.map(p => (
                  <div key={p.code}
                    onMouseDown={e => { e.preventDefault(); patchEntry({ product_name: p.name }); setProdSearch(''); setShowSuggest(false) }}
                    style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--inb-bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    <span style={{ color: 'var(--text)', fontWeight: 600, flex: 1 }}>{p.name}</span>
                    {getInventory(p.code) !== undefined && (
                      <span style={{
                        fontSize: 10, padding: '1px 6px', borderRadius: 8, whiteSpace: 'nowrap',
                        background: getInventory(p.code)! > 0 ? 'var(--ov-bg)' : '#FEF2F2',
                        color: getInventory(p.code)! > 0 ? 'var(--overseas)' : 'var(--danger)',
                        border: `1px solid ${getInventory(p.code)! > 0 ? 'var(--ov-bd)' : '#FACACA'}`,
                      }}>
                        在庫 {getInventory(p.code)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="fg"><label>個数</label><input type="number" value={entry.qty} onChange={e => patchEntry({ qty: e.target.value })} placeholder="0" style={inputStyle()} /></div>
          <div className="fg"><label>単価 (¥)</label><input type="number" value={entry.unit_price} onChange={e => patchEntry({ unit_price: e.target.value })} placeholder="0" style={inputStyle()} /></div>
          <div className="fg">
            <label>問番{section === 'postal' && <span style={{ color: 'var(--danger)' }}> 必須</span>}</label>
            <input value={entry.tracking_no} onChange={e => patchEntry({ tracking_no: e.target.value })} style={inputStyle()} />
          </div>
          <div className="fg"><label>支払日</label><input type="date" value={entry.payment_date} onChange={e => patchEntry({ payment_date: e.target.value })} style={inputStyle()} /></div>
          <div className="fg" style={{ gridColumn: 'span 2' }}><label>備考</label><input value={entry.remarks} onChange={e => patchEntry({ remarks: e.target.value })} style={inputStyle()} /></div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }} onKeyDown={handleEntryKeyDown}>
          <button onClick={confirmEntry} disabled={saving} style={{
            padding: '9px 26px', background: col, color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)',
            fontSize: 13, fontWeight: 800, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
          }}>
            ✓ 確定して追加
          </button>
        </div>
      </div>
    </div>
  )
}
