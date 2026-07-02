'use client'
import React, { useState } from 'react'
import { Shipment, Inbound, CARRIERS, CARRIER_COLOR, fmt, fmtDate, weekday } from '@/lib/types'
import { SupabaseClient } from '@supabase/supabase-js'
import PackGroupTable, { buildPackGroups } from './PackGroupTable'

interface Props {
  supabase: SupabaseClient
  shipments: Shipment[]
  inbounds: Inbound[]
  reload: () => void
}

const editInputStyle: React.CSSProperties = {
  width: '100%', fontSize: 12, padding: '3px 6px', background: 'var(--surface)',
  border: '1px solid var(--border)', borderRadius: 4, outline: 'none', color: 'var(--text)',
}

function monthLabel(ym: string) {
  const [y, m] = ym.split('-')
  return `${y}年${parseInt(m, 10)}月`
}

export default function ListView({ supabase, shipments, inbounds, reload }: Props) {
  const dates = [...new Set([...shipments.map(s => s.date), ...inbounds.map(b => b.date)])].sort().reverse()
  const months = [...new Set(dates.map(d => d.slice(0, 7)))]
  const [selMonth, setSelMonth] = useState(months[0] || '')
  const [selDay, setSelDay] = useState<string | null>(null)
  const [editingInbDates, setEditingInbDates] = useState<Set<string>>(new Set())

  const monthDays = dates.filter(d => d.startsWith(selMonth))
  const visibleDates = selDay ? [selDay] : monthDays

  const chooseMonth = (m: string) => {
    setSelMonth(m)
    setSelDay(null)
  }

  const toggleInbEdit = (d: string) => {
    setEditingInbDates(prev => {
      const next = new Set(prev)
      next.has(d) ? next.delete(d) : next.add(d)
      return next
    })
  }

  const updateInbound = async (id: string, patch: Record<string, any>) => {
    await supabase.from('inbounds').update(patch).eq('id', id)
    reload()
  }

  const delInbound = async (id: string) => {
    if (!confirm('この入荷データを削除しますか？')) return
    await supabase.from('inbounds').delete().eq('id', id)
    reload()
  }

  return (
    <div>
      <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 16 }}>一覧</div>

      {/* 月選択 */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {months.map(m => (
          <button key={m} onClick={() => chooseMonth(m)} style={{
            padding: '6px 14px', borderRadius: 'var(--radius-sm)',
            border: `1.5px solid ${m === selMonth ? 'var(--overseas)' : 'var(--border)'}`,
            background: m === selMonth ? 'var(--ov-bg)' : 'var(--surface)',
            color: m === selMonth ? 'var(--overseas)' : 'var(--text2)',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}>
            {monthLabel(m)}
          </button>
        ))}
      </div>

      {/* 日選択 */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
        <button onClick={() => setSelDay(null)} style={{
          padding: '5px 12px', borderRadius: 'var(--radius-sm)',
          border: `1.5px solid ${!selDay ? 'var(--overseas)' : 'var(--border)'}`,
          background: !selDay ? 'var(--ov-bg)' : 'var(--surface)',
          color: !selDay ? 'var(--overseas)' : 'var(--text2)',
          fontSize: 11, fontWeight: 700, cursor: 'pointer',
        }}>
          全て（{monthDays.length}日）
        </button>
        {monthDays.map(d => (
          <button key={d} onClick={() => setSelDay(d)} style={{
            padding: '5px 12px', borderRadius: 'var(--radius-sm)',
            border: `1.5px solid ${selDay === d ? 'var(--overseas)' : 'var(--border)'}`,
            background: selDay === d ? 'var(--ov-bg)' : 'var(--surface)',
            color: selDay === d ? 'var(--overseas)' : 'var(--text2)',
            fontSize: 11, fontWeight: 700, cursor: 'pointer',
          }}>
            {weekday(d) === '' ? d : `${d.slice(8)}日（${weekday(d)}）`}
          </button>
        ))}
      </div>

      {!visibleDates.length && <div className="empty">この期間のデータはありません</div>}

      {visibleDates.map(d => {
        const ds = shipments.filter(s => s.date === d)
        const di = inbounds.filter(b => b.date === d)
        if (!ds.length && !di.length) return null
        const tOut = ds.reduce((a, s) => a + (s.amount || 0), 0)
        const tIn  = di.reduce((a, b) => a + (b.amount || 0), 0)
        const pr   = tOut - tIn

        return (
          <div key={d} className="card" style={{ marginBottom: 14 }}>
            <div className="card-head">
              <span style={{ fontWeight: 800 }}>{fmtDate(d)}（{weekday(d)}）</span>
              <span style={{ display: 'flex', gap: 14, fontSize: 11 }}>
                <span style={{ color: 'var(--overseas)' }}>出荷 ¥{fmt(tOut)}</span>
                <span style={{ color: 'var(--inbound)' }}>入荷 ¥{fmt(tIn)}</span>
                <span style={{ color: pr >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 800 }}>粗利 ¥{fmt(pr)}</span>
              </span>
            </div>
            {ds.length > 0 && CARRIERS.map(carrier => {
              const cRows = ds.filter(s => s.carrier === carrier)
              if (!cRows.length) return null
              const packs = buildPackGroups(cRows)
              const col   = CARRIER_COLOR[carrier]
              const cTotal = cRows.reduce((a, r) => a + (r.amount || 0), 0)
              return (
                <div key={carrier} style={{ borderTop: '1px solid var(--border)' }}>
                  <div style={{ padding: '6px 14px', background: 'var(--sf2)', display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, fontWeight: 700 }}>
                    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 9, background: 'var(--sf2)', border: `1px solid ${col}`, color: col }}>{carrier}</span>
                    <span style={{ color: col }}>¥{fmt(cTotal)}</span>
                    <span style={{ color: 'var(--text2)' }}>{packs.length}梱包</span>
                  </div>
                  <PackGroupTable packs={packs} color={col} showDelete editable supabase={supabase} onUpdate={reload} />
                </div>
              )
            })}
            {di.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border)' }}>
                <div style={{ padding: '6px 14px', background: 'var(--inb-bg)', fontSize: 11, fontWeight: 700, color: 'var(--inbound)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span>入荷 {di.length}件</span>
                  <button onClick={() => toggleInbEdit(d)} className="btn btn-xs btn-outline"
                    style={{ marginLeft: 'auto', color: editingInbDates.has(d) ? 'var(--overseas)' : undefined, borderColor: editingInbDates.has(d) ? 'var(--ov-bd)' : undefined }}>
                    {editingInbDates.has(d) ? '編集終了' : '✎ 編集'}
                  </button>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead><tr>
                      <th>会社/名前</th><th>商品名</th>
                      <th style={{ textAlign: 'right' }}>個数</th>
                      <th style={{ textAlign: 'right' }}>単価</th>
                      <th style={{ textAlign: 'right' }}>金額</th>
                      {editingInbDates.has(d) && <th>日付</th>}
                      {editingInbDates.has(d) && <th style={{ width: 1 }}></th>}
                    </tr></thead>
                    <tbody>
                      {di.map(x => editingInbDates.has(d) ? (
                        <tr key={x.id}>
                          <td style={{ minWidth: 120 }}>
                            <input
                              defaultValue={x.company}
                              onBlur={e => e.target.value !== x.company && updateInbound(x.id, { company: e.target.value })}
                              style={editInputStyle}
                            />
                          </td>
                          <td style={{ minWidth: 140 }}>
                            <input
                              defaultValue={x.product_name}
                              onBlur={e => e.target.value !== x.product_name && updateInbound(x.id, { product_name: e.target.value })}
                              style={editInputStyle}
                            />
                          </td>
                          <td style={{ textAlign: 'right', width: 70 }}>
                            <input
                              type="number" defaultValue={x.qty}
                              onBlur={e => {
                                const qty = +e.target.value || 0
                                if (qty === x.qty) return
                                updateInbound(x.id, { qty, amount: qty * (x.unit_price || 0) })
                              }}
                              style={{ ...editInputStyle, textAlign: 'right' }}
                            />
                          </td>
                          <td style={{ textAlign: 'right', width: 90 }}>
                            <input
                              type="number" defaultValue={x.unit_price}
                              onBlur={e => {
                                const unit_price = +e.target.value || 0
                                if (unit_price === x.unit_price) return
                                updateInbound(x.id, { unit_price, amount: (x.qty || 0) * unit_price })
                              }}
                              style={{ ...editInputStyle, textAlign: 'right' }}
                            />
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--inbound)' }}>¥{fmt(x.amount)}</td>
                          <td style={{ minWidth: 140 }}>
                            <input
                              type="date" defaultValue={x.date}
                              onChange={e => e.target.value && updateInbound(x.id, { date: e.target.value })}
                              style={editInputStyle}
                            />
                          </td>
                          <td>
                            <button onClick={() => delInbound(x.id)} className="btn btn-xs btn-outline" title="この行を削除">✕</button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={x.id}>
                          <td>{x.company || '-'}</td>
                          <td style={{ fontWeight: 600 }}>{x.product_name || '-'}</td>
                          <td style={{ textAlign: 'right' }}>{x.qty}</td>
                          <td style={{ textAlign: 'right' }}>¥{fmt(x.unit_price)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--inbound)' }}>¥{fmt(x.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
