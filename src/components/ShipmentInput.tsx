'use client'
import { useState, useEffect } from 'react'
import { Shipment, Carrier, CARRIERS, CARRIER_COLOR, CARRIER_BG, FEDEX_OPS, fmt } from '@/lib/types'
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

interface EntryRow {
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

function inputStyle(extra?: React.CSSProperties): React.CSSProperties {
  return { width: '100%', fontSize: 12, padding: '3px 5px', background: '#fff', border: '1px solid #D8C270', borderRadius: 3, outline: 'none', color: '#333', ...extra }
}
function readonlyStyle(extra?: React.CSSProperties): React.CSSProperties {
  return { width: '100%', fontSize: 12, padding: '3px 5px', background: '#F1F1EC', border: '1px dashed #C9C0A0', borderRadius: 3, color: 'var(--text2)', ...extra }
}

export default function ShipmentInput({ supabase, date, setDate, shipments, reload, inbounds = [] }: Props) {
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

  const filtered = showSuggest && prodSearch.length >= 1
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

  const blankEntry = (carryFrom?: EntryRow): EntryRow => ({
    pack_no: carryFrom ? carryFrom.pack_no : nextPackNo + 1,
    product_name: '', qty: '', unit_price: '', weight: '0.3',
    tracking_no: carryFrom?.tracking_no || '',
    recipient: carryFrom?.recipient || '',
    agent: carryFrom?.agent || '',
    freight: carryFrom?.freight || '',
    op: carryFrom?.op || '',
    inventory_note: '',
  })

  const [entry, setEntry] = useState<EntryRow>(() => blankEntry())
  const [saving, setSaving] = useState(false)

  // キャリア・日付が変わったら入力欄をリセット（別キャリアのデータが混ざるのを防ぐ）
  useEffect(() => {
    setEntry(blankEntry())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carrier, date])

  const patchEntry = (patch: Partial<EntryRow>) => setEntry(prev => ({ ...prev, ...patch }))

  const existingPack = packs.find(p => p.packNo === entry.pack_no)
  const meta = existingPack ? existingPack.rows[0] : null

  const confirmEntry = async () => {
    if (!entry.product_name.trim()) { alert('商品名を入力してください'); return }
    if (saving) return
    setSaving(true)
    const qty = +entry.qty || 0
    const unit_price = +entry.unit_price || 0
    const weight = +entry.weight || 0
    await supabase.from('shipments').insert({
      date, carrier, pack_no: entry.pack_no || nextPackNo + 1, domestic: false,
      product_name: entry.product_name.trim(), qty, unit_price, amount: qty * unit_price,
      weight, total_weight: qty * weight,
      tracking_no: meta ? meta.tracking_no : entry.tracking_no,
      recipient: meta ? meta.recipient : entry.recipient,
      agent: meta ? meta.agent : entry.agent,
      freight: meta ? meta.freight : (+entry.freight || 0),
      send_op: meta ? meta.send_op : entry.op,
      remarks: '', invoice_no: '', inventory_note: entry.inventory_note, order_note: '', carry_over: '',
      chk_liqoa: false, chk_pack: false,
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

      {/* 確定済み一覧 */}
      <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
        <span>◀</span> 表は横にスクロールできます（すべての項目は右側まで続いています） <span>▶</span>
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
              <th style={{ ...TH, width: 1 }}></th>
            </tr>
          </thead>
          <tbody>
            {!packs.length && (
              <tr>
                <td colSpan={isFedex ? 13 : 12} style={{ ...CELL, textAlign: 'center', color: 'var(--text3)', padding: '14px' }}>
                  まだ確定した商品はありません。下の入力欄から追加してください。
                </td>
              </tr>
            )}
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
          </tbody>
        </table>
      </div>

      {/* 入力欄（常に1行・確定ボタンで追加） */}
      <div style={{ marginTop: 16, background: TABLE_BG, border: `2px solid ${col}`, borderRadius: 'var(--radius)', padding: '12px 14px' }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: col, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          ＋ 新しい商品を入力
          {existingPack && <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text2)' }}>（梱包{entry.pack_no}に追加されます・問番/宛先/送料などは自動で引き継ぎます）</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '70px 2fr 80px 90px 90px', gap: 8, marginBottom: 8 }} onKeyDown={handleEntryKeyDown}>
          <div className="fg"><label>梱包</label>
            <input type="number" value={entry.pack_no} onChange={e => patchEntry({ pack_no: +e.target.value || 1 })} style={inputStyle({ textAlign: 'center' })} />
          </div>
          <div className="fg" style={{ position: 'relative' }}>
            <label>商品名</label>
            <input
              value={entry.product_name}
              onChange={e => { patchEntry({ product_name: e.target.value }); setProdSearch(e.target.value); setShowSuggest(true) }}
              onFocus={e => { setProdSearch(e.target.value); setShowSuggest(true) }}
              placeholder="商品名またはコードで検索…"
              style={inputStyle()}
            />
            {showSuggest && filtered.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, minWidth: 480, background: 'var(--surface)', border: '1.5px solid var(--overseas)', borderRadius: 'var(--radius-sm)', zIndex: 1000, boxShadow: '0 4px 12px rgba(0,0,0,.1)', maxHeight: 320, overflowY: 'auto' }}>
                {filtered.map(p => (
                  <div key={p.code}
                    onMouseDown={e => { e.preventDefault(); patchEntry({ product_name: p.name }); setProdSearch(''); setShowSuggest(false) }}
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
              </div>
            )}
          </div>
          <div className="fg"><label>個数</label><input type="number" value={entry.qty} onChange={e => patchEntry({ qty: e.target.value })} placeholder="0" style={inputStyle()} /></div>
          <div className="fg"><label>単価 (¥)</label><input type="number" value={entry.unit_price} onChange={e => patchEntry({ unit_price: e.target.value })} placeholder="0" style={inputStyle()} /></div>
          <div className="fg"><label>重量 (kg)</label><input type="number" step="0.01" value={entry.weight} onChange={e => patchEntry({ weight: e.target.value })} style={inputStyle()} /></div>
        </div>

        {!meta && (
          <div style={{ display: 'grid', gridTemplateColumns: `1fr 1fr 1fr 90px${isFedex ? ' 1.4fr' : ''}`, gap: 8, marginBottom: 8 }} onKeyDown={handleEntryKeyDown}>
            <div className="fg"><label>問番</label><input value={entry.tracking_no} onChange={e => patchEntry({ tracking_no: e.target.value })} placeholder="追跡番号" style={inputStyle()} /></div>
            <div className="fg"><label>宛先名</label><input value={entry.recipient} onChange={e => patchEntry({ recipient: e.target.value })} placeholder="会社名 / 個人名" style={inputStyle()} /></div>
            <div className="fg"><label>代行者名</label><input value={entry.agent} onChange={e => patchEntry({ agent: e.target.value })} placeholder="代行者名" style={inputStyle()} /></div>
            <div className="fg"><label>送料(¥)</label><input type="number" value={entry.freight} onChange={e => patchEntry({ freight: e.target.value })} placeholder="0" style={inputStyle()} /></div>
            {isFedex && (
              <div className="fg">
                <label>発送OP</label>
                <select value={entry.op} onChange={e => patchEntry({ op: e.target.value })} style={inputStyle()}>
                  <option value="">選択</option>
                  {FEDEX_OPS.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            )}
          </div>
        )}
        {meta && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 11, color: 'var(--text2)', background: '#F1F1EC', border: '1px dashed #C9C0A0', borderRadius: 4, padding: '6px 10px', marginBottom: 8 }}>
            <span>問番: <strong>{meta.tracking_no || '未入力'}</strong></span>
            <span>宛先: <strong>{meta.recipient || '未入力'}</strong></span>
            <span>代行: <strong>{meta.agent || '未入力'}</strong></span>
            <span>送料: <strong>¥{fmt(meta.freight)}</strong></span>
            <span style={{ marginLeft: 'auto', color: 'var(--text3)' }}>※梱包{entry.pack_no}の既存商品と共通（変更は上の一覧のセルから）</span>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }} onKeyDown={handleEntryKeyDown}>
          <div className="fg"><label>在庫内訳</label><input value={entry.inventory_note} onChange={e => patchEntry({ inventory_note: e.target.value })} style={inputStyle()} /></div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
            <button onClick={confirmEntry} disabled={saving} style={{
              padding: '9px 26px', background: col, color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)',
              fontSize: 13, fontWeight: 800, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
            }}>
              ✓ 確定して追加
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
