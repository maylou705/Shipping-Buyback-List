'use client'
import { View } from './AppShell'

const NAVS: { v: View; label: string }[] = [
  { v: 'dashboard', label: 'ダッシュボード' },
  { v: 'shipment',  label: '出荷入力' },
  { v: 'inbound',   label: '入荷入力' },
  { v: 'list',      label: '一覧' },
  { v: 'analytics', label: '分析' },
]

export default function Header({ view, setView }: { view: View; setView: (v: View) => void }) {
  const dateStr = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })

  return (
    <header style={{
      background: 'var(--surface)', borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', padding: '0 18px', gap: '3px',
      position: 'sticky', top: 0, zIndex: 200,
    }}>
      <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: '.06em', marginRight: 14, whiteSpace: 'nowrap' }}>
        Shipping <em style={{ color: 'var(--overseas)', fontStyle: 'normal' }}>Buyback List</em>
      </span>
      <nav style={{ display: 'flex', gap: 2 }}>
        {NAVS.map(({ v, label }) => (
          <button key={v} onClick={() => setView(v)} style={{
            background: view === v ? 'var(--ov-bg)' : 'none',
            border: 'none', cursor: 'pointer',
            padding: '6px 12px', borderRadius: 'var(--radius-sm)',
            fontSize: 12, fontWeight: view === v ? 700 : 600,
            color: view === v ? 'var(--overseas)' : 'var(--text2)',
            transition: '.12s', whiteSpace: 'nowrap',
          }}>
            {label}
          </button>
        ))}
      </nav>
      <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)' }}>{dateStr}</div>
    </header>
  )
}
