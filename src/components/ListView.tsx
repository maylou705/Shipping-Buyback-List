'use client'
import { Shipment, Inbound, CARRIERS, CARRIER_COLOR, fmt, fmtDate, weekday } from '@/lib/types'
import { SupabaseClient } from '@supabase/supabase-js'
import PackGroupTable, { buildPackGroups } from './PackGroupTable'

interface Props {
  supabase: SupabaseClient
  shipments: Shipment[]
  inbounds: Inbound[]
  reload: () => void
}

export default function ListView({ supabase, shipments, inbounds, reload }: Props) {
  const dates = [...new Set([...shipments.map(s => s.date), ...inbounds.map(b => b.date)])].sort().reverse()

  return (
    <div>
      <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 16 }}>一覧</div>
      {dates.map(d => {
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
                  <PackGroupTable packs={packs} color={col} showDelete supabase={supabase} onUpdate={reload} />
                </div>
              )
            })}
            {di.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border)' }}>
                <div style={{ padding: '6px 14px', background: 'var(--inb-bg)', fontSize: 11, fontWeight: 700, color: 'var(--inbound)' }}>
                  入荷 {di.length}件
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead><tr>
                      <th>会社/名前</th><th>商品名</th>
                      <th style={{ textAlign: 'right' }}>個数</th>
                      <th style={{ textAlign: 'right' }}>単価</th>
                      <th style={{ textAlign: 'right' }}>金額</th>
                    </tr></thead>
                    <tbody>
                      {di.map(x => (
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
