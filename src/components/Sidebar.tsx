'use client'
import { useState } from 'react'
import { Shipment, Inbound, fmtShort, weekday } from '@/lib/types'

interface Props {
  date: string
  setDate: (d: string) => void
  shipments: Shipment[]
  inbounds: Inbound[]
}

function monthLabel(ym: string) {
  const [y, m] = ym.split('-')
  return `${y}年${parseInt(m, 10)}月`
}

export default function Sidebar({ date, setDate, shipments, inbounds }: Props) {
  const allDates = [...new Set([
    ...shipments.map(s => s.date),
    ...inbounds.map(b => b.date),
    date,
  ])].sort().reverse()

  const months = [...new Set(allDates.map(d => d.slice(0, 7)))]
  const currentMonth = date.slice(0, 7)
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set([currentMonth]))

  const toggleMonth = (m: string) => {
    setOpenMonths(prev => {
      const next = new Set(prev)
      next.has(m) ? next.delete(m) : next.add(m)
      return next
    })
  }

  const count = (d: string) =>
    shipments.filter(s => s.date === d).length +
    inbounds.filter(b => b.date === d).length

  const monthCount = (m: string) =>
    allDates.filter(d => d.startsWith(m)).reduce((a, d) => a + count(d), 0)

  return (
    <aside className="app-sidebar" style={{
      background: 'var(--surface)', borderRight: '1px solid var(--border)',
      overflowY: 'auto', padding: '10px 0',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--text3)', textTransform: 'uppercase', padding: '8px 14px 4px' }}>
        日付
      </div>
      {months.map(m => {
        const isOpen = openMonths.has(m)
        const days = allDates.filter(d => d.startsWith(m))
        const hasCurrent = m === currentMonth

        return (
          <div key={m}>
            <button onClick={() => toggleMonth(m)} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', border: 'none', textAlign: 'left', cursor: 'pointer',
              padding: '7px 14px', fontSize: 12, fontWeight: 700,
              background: hasCurrent ? 'var(--sf2)' : 'none',
              color: 'var(--text)',
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 9, color: 'var(--text3)' }}>{isOpen ? '▾' : '▸'}</span>
                {monthLabel(m)}
              </span>
              <span style={{
                fontSize: 10, borderRadius: 9, padding: '1px 6px',
                background: 'var(--sf2)', color: 'var(--text3)',
              }}>
                {monthCount(m)}
              </span>
            </button>
            {isOpen && days.map(d => (
              <button key={d} onClick={() => setDate(d)} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', border: 'none',
                textAlign: 'left', cursor: 'pointer', padding: '6px 14px 6px 26px',
                fontSize: 12, borderLeft: `2px solid ${d === date ? 'var(--overseas)' : 'transparent'}`,
                background: d === date ? 'var(--ov-bg)' : 'none',
                color: d === date ? 'var(--overseas)' : 'var(--text2)',
                fontWeight: d === date ? 700 : 400,
                transition: '.12s',
              } as React.CSSProperties}>
                <span>{fmtShort(d)}（{weekday(d)}）</span>
                <span style={{
                  fontSize: 10, borderRadius: 9, padding: '1px 6px',
                  background: d === date ? 'var(--ov-bd)' : 'var(--sf2)',
                  color: d === date ? 'var(--overseas)' : 'var(--text3)',
                }}>
                  {count(d)}
                </span>
              </button>
            ))}
          </div>
        )
      })}
    </aside>
  )
}
