'use client'
import { Shipment, Inbound, fmtShort } from '@/lib/types'

interface Props {
  date: string
  setDate: (d: string) => void
  shipments: Shipment[]
  inbounds: Inbound[]
}

export default function Sidebar({ date, setDate, shipments, inbounds }: Props) {
  const allDates = [...new Set([
    ...shipments.map(s => s.date),
    ...inbounds.map(b => b.date),
    date,
  ])].sort().reverse()

  const count = (d: string) =>
    shipments.filter(s => s.date === d).length +
    inbounds.filter(b => b.date === d).length

  return (
    <aside style={{
      background: 'var(--surface)', borderRight: '1px solid var(--border)',
      overflowY: 'auto', padding: '10px 0',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--text3)', textTransform: 'uppercase', padding: '8px 14px 4px' }}>
        日付
      </div>
      {allDates.map(d => (
        <button key={d} onClick={() => setDate(d)} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', background: 'none', border: 'none',
          textAlign: 'left', cursor: 'pointer', padding: '6px 14px',
          fontSize: 12, borderLeft: `2px solid ${d === date ? 'var(--overseas)' : 'transparent'}`,
          background: d === date ? 'var(--ov-bg)' : 'none',
          color: d === date ? 'var(--overseas)' : 'var(--text2)',
          fontWeight: d === date ? 700 : 400,
          transition: '.12s',
        } as React.CSSProperties}>
          {fmtShort(d)}
          <span style={{
            fontSize: 10, borderRadius: 9, padding: '1px 6px',
            background: d === date ? 'var(--ov-bd)' : 'var(--sf2)',
            color: d === date ? 'var(--overseas)' : 'var(--text3)',
          }}>
            {count(d)}
          </span>
        </button>
      ))}
    </aside>
  )
}
