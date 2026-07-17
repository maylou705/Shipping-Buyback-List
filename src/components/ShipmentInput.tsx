'use client'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Shipment, Carrier, CARRIERS, CARRIER_COLOR, CARRIER_BG, FEDEX_OPS, fmt, uid } from '@/lib/types'
import { SupabaseClient } from '@supabase/supabase-js'
import { createQuoteClient } from '@/lib/supabase'
import { buildPackGroups, Pack } from './PackGroupTable'

interface Props {
  supabase: SupabaseClient
  date: string
  setDate?: (d: string) => void
  shipments: Shipment[]
  reload: () => void
  inbounds?: { product_name: string; qty: number }[]
}

interface DraftRow {
  _id: string
  pack_no: number
  product_name: string
  qty: string
  unit_price: string
  weight: string
  tracking_no: string
  recipient: string
  agent: string
  freight: string
  op: string
  inventory_note: string
}

interface SuggestPos { top: number; left: number; width: number }

function inputStyle(extra?: React.CSSProperties): React.CSSProperties {
  return { width: '100%', fontSize: 12, padding: '3px 5px', background: '#fff', border: '1px solid #D8C270', borderRadius: 3, outline: 'none', color: '#333', ...extra }
}
function readonlyStyle(extra?: React.CSSProperties): React.CSSProperties {
  return { width: '100%', fontSize: 12, padding: '3px 5px', background: '#F1F1EC', border: '1px dashed #C9C0A0', borderRadius: 3, color: 'var(--text2)', ...extra }
}

export default function ShipmentInput({ supabase, date, setDate, shipments, reload, inbounds = [] }: Props) {
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
    supabase.from('inventory').select('imported_at').order('imported_at', { ascending: false }).limit(1).then(({ data: latest }) => {
      if (!latest?.length) return
      supabase.from('inventory').select('product_code, grade, qty').eq('imported_at', latest[0].imported_at).then(({ data: inv }) => {
        if (inv) {
          const m: Record<string, number> = {}
          inv.forEach((r: any) => { const k = `${r.product_code}__${r.grade}`; m[k] = (m[k] || 0) + r.qty })
          setInventoryByPd(m)
        }
      })
    })
  }, [supabase])

  const getInventory = (code: string, grade?: string): number | undefined => {
    const unit = products.find(p => p.code === code && (grade ? p.grade === grade : true)) as any
    if (!unit?.recore_pd_code) return undefined
    const gradeMap: Record<string, string> = { '無印': 'シュリンク有', 'シュリンク無': 'シュリンク無', '★シュリ': '★', 'ぺリなし': 'その他' }
    const key = `${unit.recore_pd_code}__${gradeMap[unit.grade] || unit.grade}`
    return inventoryByPd[key]
  }

  const filtered = prodSearch.length >= 1
    ? products.filter(p => p.code.toLowerCase().includes(prodSearch.toLowerCase()) || p.name.toLowerCase().includes(prodSearch.toLowerCase())).slice(0, 8)
    : []

  const [carrier, setCarrier] = useState<Carrier>('FedEx')
  const col = CARRIER_COLOR[carrier]
  const isFedex = carrier === 'FedEx'

  // キャリアの色に合わせたセル配色
  const CELL: React.CSSProperties = { border: `1px solid ${col}55`, padding: '4px 6px', fontSize: 12 }
  const TH: React.CSSProperties = { ...CELL, background: col, fontWeight: 700, textAlign: 'left', whiteSpace: 'nowrap', color: '#fff' }
  const TABLE_BG = CARRIER_BG[carrier]
  const PACK_CELL_BG = col + '26'
  const DRAFT_BG = `color-mix(in srgb, ${col} 13%, white)`

  const dayShips = shipments.filter(s => s.date === date && s.carrier === carrier)
  const packs: Pack[] = buildPackGroups(dayShips)

  const inboundQtyMap: Record<string, number> = {}
  inbounds.forEach(b => { const k = (b.product_name || '').toLowerCase(); if (k) inboundQtyMap[k] = (inboundQtyMap[k] || 0) + (b.qty || 0) })
  const getInbound = (name: string) => {
    const lower = name.toLowerCase(); let total = 0; let found = false
    Object.entries(inboundQtyMap).forEach(([k, v]) => { if (k.includes(lower) || lower.includes(k)) { total += v; found = true } })
    return found ? total : undefined
  }
  const getShipped = (name: string) => {
    const lower = name.toLowerCase(); let total = 0; let found = false
    dayShips.forEach(s => { const k = (s.product_name || '').toLowerCase(); if (k.includes(lower) || lower.includes(k)) { total += s.qty || 0; found = true } })
    return found ? total : undefined
  }

  const nextPackNo = dayShips.length ? Math.max(...dayShips.map(s => s.pack_no)) : 0

  const blankDraft = (carryFrom?: DraftRow): DraftRow => ({
    _id: uid(),
    pack_no: carryFrom ? carryFrom.pack_no : nextPackNo + 1,
    product_name: '', qty: '', unit_price: '', weight: '0.3',
    tracking_no: carryFrom?.tracking_no || '',
    recipient: carryFrom?.recipient || '',
    agent: carryFrom?.agent || '',
    freight: carryFrom?.freight || '',
    op: carryFrom?.op || '',
    inventory_note: '',
  })

  const [drafts, setDrafts] = useState<DraftRow[]>(() => [blankDraft()])
  const [savingId, setSavingId] = useState<string | null>(null)

  // キャリア・日付が変わったら入力中の行をリセット（別キャリアのデータが混ざるのを防ぐ）
  useEffect(() => {
    setDrafts([blankDraft()])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carrier, date])

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
    if (savingId) return
    setSavingId(d._id)
    const qty = +d.qty || 0
    const unit_price = +d.unit_price || 0
    const weight = +d.weight || 0
    const existingPack = packs.find(p => p.packNo === d.pack_no)
    const meta = existingPack ? existingPack.rows[0] : null
    await supabase.from('shipments').insert({
      date, carrier, pack_no: d.pack_no || nextPackNo + 1, domestic: false,
      product_name: d.product_name.trim(), qty, unit_price, amount: qty * unit_price,
      weight, total_weight: qty * weight,
      tracking_no: meta ? meta.tracking_no : d.tracking_no,
      recipient: meta ? meta.recipient : d.recipient,
      agent: meta ? meta.agent : d.agent,
      freight: meta ? meta.freight : (+d.freight || 0),
      send_op: meta ? meta.send_op : d.op,
      remarks: '', invoice_no: '', inventory_note: d.inventory_note, order_note: '', carry_over: '',
      chk_liqoa: false, chk_pack: false,
    })
    setDrafts(prev => {
      const rest = prev.filter(x => x._id !== d._id)
      return rest.length ? rest : [blankDraft(d)]
    })
    setSavingId(null)
    reload()
  }

  const updateRow = async (id: string, patch: Record<string, any>) => {
    await supabase.from('shipments').update(patch).eq('id', id)
    reload()
  }
  const updatePackFields = async (packNo: number, packDate: string, patch: Record<string, any>) => {
    await supabase.from('shipments').update(patch).eq('carrier', carrier).eq('pack_no', packNo).eq('date', packDate)
    reload()
  }
  const delRow = async (id: string) => {
    if (!confirm('この行を削除しますか？')) return
    await supabase.from('shipments').delete().eq('id', id)
    reload()
  }
  const delPack = async (packNo: number, packDate: string) => {
    if (!confirm(`梱包${packNo}を削除しますか？`)) return
    await supabase.from('shipments').delete().eq('carrier', carrier).eq('pack_no', packNo).eq('date', packDate)
    reload()
  }

  const dayTotal = dayShips.reduce((a, s) => a + (s.amount || 0), 0)

  return (
    <div style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
        <div className="fg" style={{ maxWidth: 170 }}>
          <label>日付</label>
          <input type="date" value={date} onChange={e => setDate?.(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {CARRIERS.map(c => (
            <button key={c} onClick={() => setCarrier(c)} style={{
              padding: '6px 14px', borderRadius: 'var(--radius-sm)',
              border: `1.5px solid ${c === carrier ? CARRIER_COLOR[c] : 'var(--border)'}`,
              background: c === carrier ? CARRIER_COLOR[c] + '22' : 'var(--surface)',
              color: c === carrier ? CARRIER_COLOR[c] : 'var(--text2)',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>{c}</button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 800, color: col }}>
          本日合計 ¥{fmt(dayTotal)}（{dayShips.length}件）
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
        <span>◀</span> 表は横にスクロールできます。黄色の行に入力し「✓」で確定してください <span>▶</span>
      </div>
      <div style={{ overflowX: 'auto', border: `1px solid ${col}55`, borderRadius: 'var(--radius-sm)' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', background: TABLE_BG }}>
          <thead>
            <tr>
              <th style={{ ...TH, textAlign: 'center', width: 44, position: 'sticky', left: 0, zIndex: 2 }}>梱包</th>
              <th style={{ ...TH, minWidth: 200 }}>商品名</th>
              <th style={{ ...TH, textAlign: 'right' }}>個数</th>
              <th style={{ ...TH, textAlign: 'right' }}>単価</th>
              <th style={{ ...TH, textAlign: 'right' }}>金額</th>
              <th style={{ ...TH, textAlign: 'right' }}>重量</th>
              <th style={TH}>問番</th>
              <th style={{ ...TH, minWidth: 120 }}>宛先</th>
              <th style={TH}>代行者名</th>
              <th style={{ ...TH, textAlign: 'right' }}>送料</th>
              {isFedex && <th style={TH}>発送OP</th>}
              <th style={TH}>在庫内訳</th>
              <th style={{ ...TH, width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {/* 確定済み（既に保存された商品） */}
            {packs.map(pack => {
              const first = pack.rows[0]
              return pack.rows.map((r, ri) => (
                <tr key={r.id}>
                  {ri === 0 && (
                    <td rowSpan={pack.rows.length} style={{ ...CELL, textAlign: 'center', verticalAlign: 'top', fontWeight: 800, color: col, background: PACK_CELL_BG, position: 'sticky', left: 0, zIndex: 1 }}>
                      {pack.packNo}
                      <div>
                        <button onClick={() => delPack(pack.packNo, first.date)} title="梱包削除"
                          style={{ marginTop: 4, fontSize: 9, padding: '1px 4px', border: '1px solid #D8C270', borderRadius: 3, background: '#fff', cursor: 'pointer', color: '#a33' }}>✕</button>
                      </div>
                    </td>
                  )}
                  <td style={CELL}>
                    <input defaultValue={r.product_name} onBlur={e => e.target.value !== r.product_name && updateRow(r.id, { product_name: e.target.value })} style={inputStyle()} />
                  </td>
                  <td style={CELL}>
                    <input type="number" defaultValue={r.qty} onBlur={e => { const qty = +e.target.value || 0; if (qty !== r.qty) updateRow(r.id, { qty, amount: qty * (r.unit_price || 0), total_weight: qty * (r.weight || 0) }) }} style={inputStyle({ textAlign: 'right' })} />
                  </td>
                  <td style={CELL}>
                    <input type="number" defaultValue={r.unit_price} onBlur={e => { const up = +e.target.value || 0; if (up !== r.unit_price) updateRow(r.id, { unit_price: up, amount: (r.qty || 0) * up }) }} style={inputStyle({ textAlign: 'right' })} />
                  </td>
                  <td style={{ ...CELL, textAlign: 'right', fontWeight: 700, color: col }}>¥{fmt(r.amount)}</td>
                  <td style={CELL}>
                    <input type="number" step="0.01" defaultValue={r.weight} onBlur={e => { const w = +e.target.value || 0; if (w !== r.weight) updateRow(r.id, { weight: w, total_weight: (r.qty || 0) * w }) }} style={inputStyle({ textAlign: 'right' })} />
                  </td>
                  {ri === 0 && (
                    <>
                      <td style={CELL} rowSpan={pack.rows.length}>
                        <input defaultValue={first.tracking_no} onBlur={e => e.target.value !== first.tracking_no && updatePackFields(pack.packNo, first.date, { tracking_no: e.target.value })} style={inputStyle()} />
                      </td>
                      <td style={CELL} rowSpan={pack.rows.length}>
                        <input defaultValue={first.recipient} onBlur={e => e.target.value !== first.recipient && updatePackFields(pack.packNo, first.date, { recipient: e.target.value })} style={inputStyle()} />
                      </td>
                      <td style={CELL} rowSpan={pack.rows.length}>
                        <input defaultValue={first.agent} onBlur={e => e.target.value !== first.agent && updatePackFields(pack.packNo, first.date, { agent: e.target.value })} style={inputStyle()} />
                      </td>
                      <td style={CELL} rowSpan={pack.rows.length}>
                        <input type="number" defaultValue={first.freight} onBlur={e => { const fr = +e.target.value || 0; if (fr !== first.freight) updatePackFields(pack.packNo, first.date, { freight: fr }) }} style={inputStyle({ textAlign: 'right' })} />
                      </td>
                      {isFedex && (
                        <td style={CELL} rowSpan={pack.rows.length}>
                          <select defaultValue={first.send_op} onBlur={e => e.target.value !== first.send_op && updatePackFields(pack.packNo, first.date, { send_op: e.target.value })} style={inputStyle()}>
                            <option value="">選択</option>
                            {FEDEX_OPS.map(o => <option key={o}>{o}</option>)}
                          </select>
                        </td>
                      )}
                    </>
                  )}
                  <td style={CELL}>
                    <input defaultValue={r.inventory_note} onBlur={e => e.target.value !== r.inventory_note && updateRow(r.id, { inventory_note: e.target.value })} style={inputStyle()} />
                  </td>
                  <td style={{ ...CELL, textAlign: 'center' }}>
                    <button onClick={() => delRow(r.id)} style={{ fontSize: 10, padding: '1px 5px', border: '1px solid #D8C270', borderRadius: 3, background: '#fff', cursor: 'pointer', color: '#a33' }}>✕</button>
                  </td>
                </tr>
              ))
            })}

            {/* 入力中（未確定）の行 */}
            {drafts.map(d => {
              const existingPack = packs.find(p => p.packNo === d.pack_no)
              const meta = existingPack ? existingPack.rows[0] : null
              return (
                <tr key={d._id} style={{ background: DRAFT_BG }}>
                  <td style={{ ...CELL, position: 'sticky', left: 0, zIndex: 1, background: DRAFT_BG }}>
                    <input type="number" value={d.pack_no} onChange={e => updateDraft(d._id, { pack_no: +e.target.value || 1 })} style={inputStyle({ textAlign: 'center' })} />
                  </td>
                  <td style={CELL}>
                    <input
                      value={d.product_name}
                      onChange={e => {
                        updateDraft(d._id, { product_name: e.target.value }); setProdSearch(e.target.value); setActiveDraftId(d._id)
                        const r = e.target.getBoundingClientRect()
                        setSuggestPos({ top: r.bottom + window.scrollY, left: r.left + window.scrollX, width: Math.max(r.width, 480) })
                      }}
                      onFocus={e => {
                        setProdSearch(e.target.value); setActiveDraftId(d._id)
                        const r = e.target.getBoundingClientRect()
                        setSuggestPos({ top: r.bottom + window.scrollY, left: r.left + window.scrollX, width: Math.max(r.width, 480) })
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
                  <td style={CELL}><input type="number" step="0.01" value={d.weight} onChange={e => updateDraft(d._id, { weight: e.target.value })} style={inputStyle({ textAlign: 'right' })} /></td>
                  {meta ? (
                    <>
                      <td style={CELL} title="梱包内の他の商品と共通です"><div style={readonlyStyle()}>{meta.tracking_no || '（未入力）'}</div></td>
                      <td style={CELL} title="梱包内の他の商品と共通です"><div style={readonlyStyle()}>{meta.recipient || '（未入力）'}</div></td>
                      <td style={CELL} title="梱包内の他の商品と共通です"><div style={readonlyStyle()}>{meta.agent || '（未入力）'}</div></td>
                      <td style={CELL} title="梱包内の他の商品と共通です"><div style={readonlyStyle({ textAlign: 'right' })}>¥{fmt(meta.freight)}</div></td>
                      {isFedex && <td style={CELL} title="梱包内の他の商品と共通です"><div style={readonlyStyle()}>{meta.send_op || '（未選択）'}</div></td>}
                    </>
                  ) : (
                    <>
                      <td style={CELL}><input value={d.tracking_no} onChange={e => updateDraft(d._id, { tracking_no: e.target.value })} style={inputStyle()} /></td>
                      <td style={CELL}><input value={d.recipient} onChange={e => updateDraft(d._id, { recipient: e.target.value })} style={inputStyle()} /></td>
                      <td style={CELL}><input value={d.agent} onChange={e => updateDraft(d._id, { agent: e.target.value })} style={inputStyle()} /></td>
                      <td style={CELL}><input type="number" value={d.freight} onChange={e => updateDraft(d._id, { freight: e.target.value })} style={inputStyle({ textAlign: 'right' })} /></td>
                      {isFedex && (
                        <td style={CELL}>
                          <select value={d.op} onChange={e => updateDraft(d._id, { op: e.target.value })} style={inputStyle()}>
                            <option value="">選択</option>
                            {FEDEX_OPS.map(o => <option key={o}>{o}</option>)}
                          </select>
                        </td>
                      )}
                    </>
                  )}
                  <td style={CELL}><input value={d.inventory_note} onChange={e => updateDraft(d._id, { inventory_note: e.target.value })} style={inputStyle()} /></td>
                  <td style={{ ...CELL, textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <button onClick={() => confirmDraft(d)} disabled={savingId === d._id} title="この行を確定"
                      style={{ fontSize: 12, padding: '3px 7px', border: 'none', borderRadius: 3, background: col, color: '#fff', cursor: 'pointer', fontWeight: 800, marginRight: 3 }}>✓</button>
                    {drafts.length > 1 && (
                      <button onClick={() => removeDraftRow(d._id)} title="この行を消す"
                        style={{ fontSize: 10, padding: '3px 6px', border: '1px solid #D8C270', borderRadius: 3, background: '#fff', cursor: 'pointer', color: '#a33' }}>✕</button>
                    )}
                  </td>
                </tr>
              )
            })}
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
            background: 'var(--surface)', border: '1.5px solid var(--overseas)', borderRadius: 'var(--radius-sm)',
            zIndex: 5000, boxShadow: '0 6px 20px rgba(0,0,0,.18)', maxHeight: 320, overflowY: 'auto',
          }}>
            {filtered.map(p => (
              <div key={p.code}
                onMouseDown={e => { e.preventDefault(); updateDraft(d._id, { product_name: p.name }); setProdSearch(''); setActiveDraftId(null) }}
                style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--ov-bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <span style={{ fontWeight: 600, color: 'var(--text)', flex: 1 }}>{p.name}</span>
                <span style={{ fontSize: 10, color: 'var(--text3)', whiteSpace: 'nowrap', background: 'var(--sf2)', padding: '1px 6px', borderRadius: 4 }}>
                  {p.unit_type}{p.grade && p.grade !== '無印' ? ` / ${p.grade}` : ''}
                </span>
                {(() => {
                  const inv = getInventory(p.code, p.grade)
                  return inv !== undefined ? (
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, whiteSpace: 'nowrap', background: inv > 0 ? 'var(--ov-bg)' : '#FEF2F2', color: inv > 0 ? 'var(--overseas)' : 'var(--danger)', border: `1px solid ${inv > 0 ? 'var(--ov-bd)' : '#FACACA'}` }}>在庫 {inv}</span>
                  ) : null
                })()}
                {getInbound(p.name) !== undefined && (
                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, whiteSpace: 'nowrap', background: 'var(--inb-bg)', color: 'var(--inbound)', border: '1px solid var(--inb-bd)' }}>入荷 {getInbound(p.name)}</span>
                )}
                {getShipped(p.name) !== undefined && (
                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, whiteSpace: 'nowrap', background: 'var(--yam-bg)', color: 'var(--yamato)', border: '1px solid var(--yam-bd)' }}>出荷済 {getShipped(p.name)}</span>
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
