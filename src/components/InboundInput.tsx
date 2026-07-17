'use client'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Inbound, InbSection, INB_SECTION_LABEL, fmt, uid } from '@/lib/types'
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

interface DraftRow {
  _id: string
  company: string
  product_name: string
  qty: string
  unit_price: string
  tracking_no: string
  payment_date: string
  remarks: string
}

interface SuggestPos { top: number; left: number; width: number }

function inputStyle(extra?: React.CSSProperties): React.CSSProperties {
  return { width: '100%', fontSize: 12, padding: '3px 5px', background: '#fff', border: '1px solid #D8C270', borderRadius: 3, outline: 'none', color: '#333', ...extra }
}

export default function InboundInput({ supabase, date, setDate, inbounds, reload }: Props) {
  const [products, setProducts] = useState<{ code: string; name: string; recore_pd_code?: string | null; grade?: string; unit_type?: string }[]>([])
  const [prodSearch, setProdSearch] = useState('')
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null)
  const [suggestPos, setSuggestPos] = useState<SuggestPos | null>(null)
  const [inventoryByPd, setInventoryByPd] = useState<Record<string, number>>({})

  useEffect(() => {
    const quote = createQuoteClient()
    quote.from('product_units').select('id, product_id, unit_type, short_code, grade, recore_pd_code').then(({ data: units, error }) => {
      if (error) console.error('product_units load error', error)
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

  const filtered = prodSearch.length >= 1
    ? products.filter(p => p.code.toLowerCase().includes(prodSearch.toLowerCase()) || p.name.toLowerCase().includes(prodSearch.toLowerCase())).slice(0, 8)
    : []

  const [section, setSection] = useState<InbSection>('corporate')
  const col = SEC_COLOR[section]
  const CELL: React.CSSProperties = { border: `1px solid ${col}`, padding: '4px 6px', fontSize: 12 }
  const TH: React.CSSProperties = { ...CELL, background: col, fontWeight: 700, textAlign: 'left', whiteSpace: 'nowrap', color: '#fff' }
  const TABLE_BG = SEC_BG[section]
  const DRAFT_BG = `color-mix(in srgb, ${col} 13%, white)`

  const di = inbounds.filter(b => b.date === date)
  const secRows = di.filter(x => x.inb_section === section)
  const tIn = di.reduce((a, b) => a + (b.amount || 0), 0)

  const blankDraft = (carryFrom?: DraftRow): DraftRow => ({
    _id: uid(),
    company: carryFrom?.company || '',
    product_name: '', qty: '', unit_price: '',
    tracking_no: carryFrom?.tracking_no || '',
    payment_date: carryFrom?.payment_date || '',
    remarks: carryFrom?.remarks || '',
  })

  const [drafts, setDrafts] = useState<DraftRow[]>(() => [blankDraft()])
  const [savingId, setSavingId] = useState<string | null>(null)

  // 区分・日付が変わったら入力中の行をリセット
  useEffect(() => {
    setDrafts([blankDraft()])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, date])

  const updateDraft = (id: string, patch: Partial<DraftRow>) => {
    setDrafts(prev => prev.map(d => d._id === id ? { ...d, ...patch } : d))
  }

  const addDraftRow = () => {
    setDrafts(prev => [...prev, blankDraft(prev[prev.length - 1])])
  }

  const removeDraftRow = (id: string) => {
    setDrafts(prev => {
      const rest = prev.filter(x => x._id !== id)
      return rest.length ? rest : [blankDraft()]
    })
  }

  const confirmDraft = async (d: DraftRow) => {
    if (!d.product_name.trim()) { alert('商品名を入力してください'); return }
    if (section === 'postal' && !d.tracking_no.trim()) { alert('郵送買取は問番が必須です'); return }
    if (savingId) return
    setSavingId(d._id)
    const qty = +d.qty || 0
    const unit_price = +d.unit_price || 0
    await supabase.from('inbounds').insert({
      date, inb_section: section, arrived: false, chk_liqoa: false,
      company: d.company, product_name: d.product_name.trim(),
      qty, unit_price, amount: qty * unit_price,
      tracking_no: d.tracking_no, payment_date: d.payment_date || null,
      remarks: d.remarks, recore_no: '',
    })
    setDrafts(prev => {
      const rest = prev.filter(x => x._id !== d._id)
      return rest.length ? rest : [blankDraft(d)]
    })
    setSavingId(null)
    reload()
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
        <span>◀</span> 表は横にスクロールできます。黄色の行に入力し「✓」で確定してください <span>▶</span>
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
              <th style={{ ...TH, width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {/* 確定済み（既に保存された商品） */}
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

            {/* 入力中（未確定）の行 */}
            {drafts.map(d => (
              <tr key={d._id} style={{ background: DRAFT_BG }}>
                <td style={{ ...CELL, position: 'sticky', left: 0, zIndex: 1, background: DRAFT_BG }}>
                  <input value={d.company} onChange={e => updateDraft(d._id, { company: e.target.value })} style={inputStyle()} />
                </td>
                <td style={CELL}>
                  <input
                    value={d.product_name}
                    onChange={e => {
                      updateDraft(d._id, { product_name: e.target.value }); setProdSearch(e.target.value); setActiveDraftId(d._id)
                      const r = e.target.getBoundingClientRect()
                      setSuggestPos({ top: r.bottom + window.scrollY, left: r.left + window.scrollX, width: Math.max(r.width, 420) })
                    }}
                    onFocus={e => {
                      setProdSearch(e.target.value); setActiveDraftId(d._id)
                      const r = e.target.getBoundingClientRect()
                      setSuggestPos({ top: r.bottom + window.scrollY, left: r.left + window.scrollX, width: Math.max(r.width, 420) })
                    }}
                    onBlur={() => setTimeout(() => setActiveDraftId(prev => (prev === d._id ? null : prev)), 150)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmDraft(d) } }}
                    placeholder="商品名またはコードで検索…"
                    style={inputStyle()}
                  />
                </td>
                <td style={CELL}><input type="number" value={d.qty} onChange={e => updateDraft(d._id, { qty: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmDraft(d) } }} style={inputStyle({ textAlign: 'right' })} /></td>
                <td style={CELL}><input type="number" value={d.unit_price} onChange={e => updateDraft(d._id, { unit_price: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmDraft(d) } }} style={inputStyle({ textAlign: 'right' })} /></td>
                <td style={{ ...CELL, textAlign: 'right', color: 'var(--text3)' }}>¥{fmt((+d.qty || 0) * (+d.unit_price || 0))}</td>
                <td style={CELL}><input value={d.tracking_no} onChange={e => updateDraft(d._id, { tracking_no: e.target.value })} style={inputStyle()} /></td>
                <td style={CELL}><input type="date" value={d.payment_date} onChange={e => updateDraft(d._id, { payment_date: e.target.value })} style={inputStyle()} /></td>
                <td style={CELL}><input value={d.remarks} onChange={e => updateDraft(d._id, { remarks: e.target.value })} style={inputStyle()} /></td>
                <td style={{ ...CELL, textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <button onClick={() => confirmDraft(d)} disabled={savingId === d._id} title="この行を確定"
                    style={{ fontSize: 12, padding: '3px 7px', border: 'none', borderRadius: 3, background: col, color: '#fff', cursor: 'pointer', fontWeight: 800, marginRight: 3 }}>✓</button>
                  {drafts.length > 1 && (
                    <button onClick={() => removeDraftRow(d._id)} title="この行を消す"
                      style={{ fontSize: 10, padding: '3px 6px', border: '1px solid #D8C270', borderRadius: 3, background: '#fff', cursor: 'pointer', color: '#a33' }}>✕</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button onClick={addDraftRow} style={{ marginTop: 10, padding: '6px 14px', borderRadius: 'var(--radius-sm)', border: '1.5px dashed var(--border)', background: 'var(--surface)', color: 'var(--text2)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
        + 行を追加
      </button>

      {typeof window !== 'undefined' && activeDraftId && suggestPos && filtered.length > 0 && (() => {
        const d = drafts.find(x => x._id === activeDraftId)
        if (!d || d.product_name !== prodSearch) return null
        return createPortal(
          <div style={{
            position: 'absolute', top: suggestPos.top, left: suggestPos.left, width: suggestPos.width,
            background: 'var(--surface)', border: '1.5px solid var(--inbound)', borderRadius: 'var(--radius-sm)',
            zIndex: 5000, boxShadow: '0 6px 20px rgba(0,0,0,.18)', maxHeight: 320, overflowY: 'auto',
          }}>
            {filtered.map(p => (
              <div key={p.code}
                onMouseDown={e => { e.preventDefault(); updateDraft(d._id, { product_name: p.name }); setProdSearch(''); setActiveDraftId(null) }}
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
          </div>,
          document.body
        )
      })()}
    </div>
  )
}
