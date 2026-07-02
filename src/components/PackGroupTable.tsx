'use client'
import React, { useState } from 'react'
import { Shipment, CARRIERS, CARRIER_COLOR, CARRIER_BG, fmt } from '@/lib/types'
import { SupabaseClient } from '@supabase/supabase-js'

interface Pack {
  carrier: Shipment['carrier']
  packNo: number
  rows: Shipment[]
}

export function buildPackGroups(rows: Shipment[]): Pack[] {
  const map = new Map<string, Pack>()
  rows.forEach(r => {
    const key = `${r.carrier}__${r.pack_no}`
    if (!map.has(key)) map.set(key, { carrier: r.carrier, packNo: r.pack_no, rows: [] })
    map.get(key)!.rows.push(r)
  })
  return [...map.values()].sort((a, b) =>
    CARRIERS.indexOf(a.carrier) - CARRIERS.indexOf(b.carrier) || a.packNo - b.packNo
  )
}

interface Props {
  packs: Pack[]
  color: string
  showChk?: boolean
  showDelete?: boolean
  editable?: boolean
  supabase?: SupabaseClient
  onUpdate?: () => void
}

const editInputStyle: React.CSSProperties = {
  width: '100%', fontSize: 12, padding: '3px 6px', background: 'var(--surface)',
  border: '1px solid var(--border)', borderRadius: 4, outline: 'none', color: 'var(--text)',
}

export default function PackGroupTable({ packs, color, showChk, showDelete, editable, supabase, onUpdate }: Props) {
  const [editingKeys, setEditingKeys] = useState<Set<string>>(new Set())

  const toggleEdit = (key: string) => {
    setEditingKeys(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const setChkAll = async (carrier: string, packNo: number, packDate: string, field: 'chk_liqoa' | 'chk_pack', val: boolean) => {
    if (!supabase) return
    await supabase.from('shipments').update({ [field]: val })
      .eq('carrier', carrier).eq('pack_no', packNo).eq('date', packDate)
    onUpdate?.()
  }

  const setInvoice = async (carrier: string, packNo: number, packDate: string, val: string) => {
    if (!supabase) return
    await supabase.from('shipments').update({ invoice_no: val })
      .eq('carrier', carrier).eq('pack_no', packNo).eq('date', packDate)
    onUpdate?.()
  }

  const delPack = async (carrier: string, packNo: number, packDate: string) => {
    if (!supabase) return
    if (!confirm(`梱包${packNo}を削除しますか？`)) return
    await supabase.from('shipments').delete().eq('carrier', carrier).eq('pack_no', packNo).eq('date', packDate)
    onUpdate?.()
  }

  const updateRow = async (id: string, patch: Record<string, any>) => {
    if (!supabase) return
    await supabase.from('shipments').update(patch).eq('id', id)
    onUpdate?.()
  }

  const updatePackDate = async (carrier: string, packNo: number, oldDate: string, newDate: string) => {
    if (!supabase || !newDate) return
    await supabase.from('shipments').update({ date: newDate }).eq('carrier', carrier).eq('pack_no', packNo).eq('date', oldDate)
    onUpdate?.()
  }

  const delRow = async (id: string) => {
    if (!supabase) return
    if (!confirm('この商品行を削除しますか？')) return
    await supabase.from('shipments').delete().eq('id', id)
    onUpdate?.()
  }

  if (!packs.length) return <div className="empty">データなし</div>

  return (
    <>
      {packs.map(pack => {
        const packAmt = pack.rows.reduce((a, r) => a + (r.amount || 0), 0)
        const packW   = pack.rows.reduce((a, r) => a + (r.total_weight || 0), 0)
        const first   = pack.rows[0]
        const allL    = pack.rows.every(r => r.chk_liqoa)
        const allP    = pack.rows.every(r => r.chk_pack)
        const packKey = `${pack.carrier}-${pack.packNo}`
        const isEditing = editable && editingKeys.has(packKey)

        return (
          <div key={`${pack.carrier}-${pack.packNo}`} style={{ borderBottom: '2px solid var(--border)' }}>
            {/* 梱包ヘッダ */}
            <div style={{
              padding: '7px 14px', background: 'var(--sf2)',
              borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 12, color }}>{`梱包 ${pack.packNo}`}</strong>
                <span style={{ fontSize: 11, fontWeight: 700, color }}>¥{fmt(packAmt)}</span>
                <span style={{ fontSize: 11, color: 'var(--text2)' }}>総重量 <strong>{packW.toFixed(2)}kg</strong></span>
                {first.recipient && <span style={{ fontSize: 11, color: 'var(--text2)' }}>宛先: <strong>{first.recipient}</strong></span>}
                {first.agent     && <span style={{ fontSize: 11, color: 'var(--text2)' }}>代行: {first.agent}</span>}
                {first.tracking_no && <span style={{ fontSize: 10, color: 'var(--text3)' }}>問番: {first.tracking_no}</span>}

                {isEditing && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 10, color: 'var(--text2)', whiteSpace: 'nowrap' }}>日付</span>
                    <input
                      type="date" defaultValue={first.date}
                      onChange={e => updatePackDate(pack.carrier, pack.packNo, first.date, e.target.value)}
                      style={{ fontSize: 11, padding: '2px 6px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, outline: 'none', color: 'var(--text)' }}
                    />
                  </span>
                )}

                {editable && (
                  <button onClick={() => toggleEdit(packKey)} className="btn btn-xs btn-outline"
                    style={{ marginLeft: 'auto', color: isEditing ? 'var(--overseas)' : undefined, borderColor: isEditing ? 'var(--ov-bd)' : undefined }}>
                    {isEditing ? '編集終了' : '✎ 編集'}
                  </button>
                )}

                {showDelete && (
                  <button onClick={() => delPack(pack.carrier, pack.packNo, first.date)} className="btn btn-xs btn-outline" style={{ marginLeft: editable ? 0 : 'auto' }}>
                    梱包削除
                  </button>
                )}
              </div>

              {showChk && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer', color: 'var(--text2)' }}>
                    <input type="checkbox" checked={allL} onChange={e => setChkAll(pack.carrier, pack.packNo, first.date, 'chk_liqoa', e.target.checked)}
                      style={{ width: 14, height: 14, accentColor: 'var(--overseas)' }} />
                    リコア
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer', color: 'var(--text2)' }}>
                    <input type="checkbox" checked={allP} onChange={e => setChkAll(pack.carrier, pack.packNo, first.date, 'chk_pack', e.target.checked)}
                      style={{ width: 14, height: 14, accentColor: 'var(--overseas)' }} />
                    梱包
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 10, color: 'var(--text2)', whiteSpace: 'nowrap' }}>請求書No</span>
                    <input
                      defaultValue={first.invoice_no || ''}
                      onBlur={e => setInvoice(pack.carrier, pack.packNo, first.date, e.target.value)}
                      placeholder="未入力"
                      style={{ width: 90, fontSize: 11, padding: '3px 6px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, outline: 'none', color: 'var(--text)' }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 商品行 */}
            <table>
              <thead>
                <tr>
                  <th>商品名</th>
                  <th style={{ textAlign: 'right' }}>個数</th>
                  <th style={{ textAlign: 'right' }}>単価</th>
                  <th style={{ textAlign: 'right' }}>金額</th>
                  <th style={{ textAlign: 'right' }}>重量</th>
                  {isEditing && <th style={{ width: 1 }}></th>}
                </tr>
              </thead>
              <tbody>
                {pack.rows.map(r => isEditing ? (
                  <tr key={r.id}>
                    <td style={{ minWidth: 140 }}>
                      <input
                        defaultValue={r.product_name}
                        onBlur={e => e.target.value !== r.product_name && updateRow(r.id, { product_name: e.target.value })}
                        style={editInputStyle}
                      />
                    </td>
                    <td style={{ textAlign: 'right', width: 70 }}>
                      <input
                        type="number" defaultValue={r.qty}
                        onBlur={e => {
                          const qty = +e.target.value || 0
                          if (qty === r.qty) return
                          updateRow(r.id, { qty, amount: qty * (r.unit_price || 0), total_weight: qty * (r.weight || 0) })
                        }}
                        style={{ ...editInputStyle, textAlign: 'right' }}
                      />
                    </td>
                    <td style={{ textAlign: 'right', width: 90 }}>
                      <input
                        type="number" defaultValue={r.unit_price}
                        onBlur={e => {
                          const unit_price = +e.target.value || 0
                          if (unit_price === r.unit_price) return
                          updateRow(r.id, { unit_price, amount: (r.qty || 0) * unit_price })
                        }}
                        style={{ ...editInputStyle, textAlign: 'right' }}
                      />
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color }}>{`¥${fmt(r.amount)}`}</td>
                    <td style={{ textAlign: 'right', width: 80 }}>
                      <input
                        type="number" step="0.01" defaultValue={r.weight}
                        onBlur={e => {
                          const weight = +e.target.value || 0
                          if (weight === r.weight) return
                          updateRow(r.id, { weight, total_weight: (r.qty || 0) * weight })
                        }}
                        style={{ ...editInputStyle, textAlign: 'right' }}
                      />
                    </td>
                    <td>
                      <button onClick={() => delRow(r.id)} className="btn btn-xs btn-outline" title="この行を削除">✕</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.product_name || '-'}</td>
                    <td style={{ textAlign: 'right' }}>{r.qty}</td>
                    <td style={{ textAlign: 'right' }}>¥{fmt(r.unit_price)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color }}>{`¥${fmt(r.amount)}`}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{r.weight}kg</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </>
  )
}
