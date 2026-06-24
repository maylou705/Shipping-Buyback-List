'use client'
import { Shipment, Inbound, CARRIERS, CARRIER_COLOR, fmt } from '@/lib/types'

interface Props {
  shipments: Shipment[]
  inbounds: Inbound[]
}

export default function Analytics({ shipments, inbounds }: Props) {
  const aOut = shipments.reduce((a, s) => a + (s.amount || 0), 0)
  const aIn  = inbounds.reduce((a, b)  => a + (b.amount || 0), 0)
  const aP   = aOut - aIn

  const ct = Object.fromEntries(CARRIERS.map(c => [c, shipments.filter(s => s.carrier === c).reduce((a, s) => a + (s.amount || 0), 0)]))

  return (
    <div>
      <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 16 }}>分析</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(145px,1fr))', gap: 10, marginBottom: 20 }}>
        {[
          { label: '累計 出荷', val: `¥${fmt(aOut)}`, sub: `${shipments.length}件`, color: 'var(--overseas)' },
          { label: '累計 入荷', val: `¥${fmt(aIn)}`,  sub: `${inbounds.length}件`,  color: 'var(--inbound)' },
          { label: '累計 粗利', val: `¥${fmt(aP)}`,   color: aP >= 0 ? 'var(--success)' : 'var(--danger)' },
          ...CARRIERS.map(c => ({ label: c, val: `¥${fmt(ct[c])}`, color: CARRIER_COLOR[c] })),
        ].map(({ label, val, sub, color }) => (
          <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color }}>{val}</div>
            {sub && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{sub}</div>}
          </div>
        ))}
      </div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, color: 'var(--text2)', textAlign: 'center', fontSize: 12 }}>
        グラフはSupabase連携後のデータが増えたら追加予定
      </div>
    </div>
  )
}
