'use client'
import { Shipment, Inbound, CARRIERS, CARRIER_COLOR, CARRIER_BG, fmt, fmtDate, weekday } from '@/lib/types'
import { SupabaseClient } from '@supabase/supabase-js'
import PackGroupTable, { buildPackGroups } from './PackGroupTable'
import { useState } from 'react'

interface Props {
  supabase: SupabaseClient
  date: string
  shipments: Shipment[]
  inbounds: Inbound[]
  reload: () => void
}

export default function Dashboard({ supabase, date, shipments, inbounds, reload }: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const ds = shipments.filter(s => s.date === date)
  const di = inbounds.filter(b => b.date === date)
  const tOut = ds.reduce((a, s) => a + (s.amount || 0), 0)
  const tIn  = di.reduce((a, b) => a + (b.amount || 0), 0)
  const aOut = shipments.reduce((a, s) => a + (s.amount || 0), 0)
  const aIn  = inbounds.reduce((a, b)  => a + (b.amount || 0), 0)

  const toggle = (k: string) => setCollapsed(p => ({ ...p, [k]: !p[k] }))
  const inboundOpen = collapsed['inbound'] !== undefined ? !collapsed['inbound'] : di.length > 0

  const chkInb = async (id: string, field: 'chk_liqoa' | 'arrived', val: boolean) => {
    await supabase.from('inbounds').update({ [field]: val }).eq('id', id)
    reload()
  }

  const KPI = ({ label, val, sub, color }: { label: string; val: string; sub?: string; color?: string }) => (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: color || 'var(--text)' }}>{val}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{sub}</div>}
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 800 }}>ダッシュボード</div>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>{fmtDate(date)}（{weekday(date)}）</div>
        </div>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10, marginBottom: 16 }}>
        <KPI label="本日 出荷" val={`¥${fmt(tOut)}`} sub={`${ds.length}件`} color="var(--overseas)" />
        <KPI label="本日 入荷" val={`¥${fmt(tIn)}`}  sub={`${di.length}件`} color="var(--inbound)" />
        <KPI label="本日 粗利" val={`¥${fmt(tOut - tIn)}`} color={tOut >= tIn ? 'var(--success)' : 'var(--danger)'} />
        <KPI label="累計 出荷" val={`¥${fmt(aOut)}`} color="var(--overseas)" />
        <KPI label="累計 入荷" val={`¥${fmt(aIn)}`}  color="var(--inbound)" />
        <KPI label="累計 粗利" val={`¥${fmt(aOut - aIn)}`} color={aOut >= aIn ? 'var(--success)' : 'var(--danger)'} />
      </div>

      {/* 配送会社セクション */}
      {CARRIERS.map(carrier => {
        const cRows = ds.filter(s => s.carrier === carrier)
        const packs = buildPackGroups(cRows)
        const cTotal = cRows.reduce((a, r) => a + (r.amount || 0), 0)
        const cW     = cRows.reduce((a, r) => a + (r.total_weight || 0), 0)
        const allChk = cRows.length > 0 && cRows.every(r => r.chk_liqoa && r.chk_pack)
        const col    = CARRIER_COLOR[carrier]
        const bg     = CARRIER_BG[carrier]
        const key    = `carrier_${carrier}`
        const open   = collapsed[key] !== undefined ? !collapsed[key] : packs.length > 0

        return (
          <div key={carrier} className="card" style={{ marginBottom: 12 }}>
            <div className="card-head" style={{ cursor: 'pointer', borderTop: `3px solid ${col}`, background: bg }} onClick={() => toggle(key)}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontWeight: 800, fontSize: 13 }}>{carrier}</span>
                <span style={{ fontSize: 11, color: 'var(--text2)' }}>{packs.length}梱包 / {cRows.length}商品</span>
                {packs.length > 0 && (
                  <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, ...(allChk ? { background: '#EDF8F3', color: '#16a34a', border: '1px solid #AADDC2' } : { background: '#FEF9EC', color: 'var(--warn)', border: '1px solid #EEE098' }) }}>
                    {allChk ? '✓ 完了' : '作業中'}
                  </span>
                )}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 11, color: 'var(--text2)' }}>{cW.toFixed(2)}kg</span>
                <span style={{ fontWeight: 800, fontSize: 13 }}>¥{fmt(cTotal)}</span>
                <span style={{ color: 'var(--text3)', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
              </span>
            </div>
            {open && (
              <div style={{ padding: 0 }}>
                {!packs.length
                  ? <div className="empty">{carrier}の出荷データなし</div>
                  : <PackGroupTable packs={packs} color={col} showChk supabase={supabase} onUpdate={reload} />
                }
              </div>
            )}
          </div>
        )
      })}

      {/* 入荷セクション */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-head" style={{ cursor: 'pointer', borderTop: '3px solid var(--inbound)', background: 'var(--inb-bg)' }} onClick={() => toggle('inbound')}>
          <span style={{ fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', gap: 10 }}>
            入荷
            <span style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 400 }}>{di.length}件</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontWeight: 800, fontSize: 13 }}>¥{fmt(tIn)}</span>
            <span style={{ color: 'var(--text3)', fontSize: 12 }}>{inboundOpen ? '▲' : '▼'}</span>
          </span>
        </div>
        {inboundOpen && (
          <div style={{ padding: 0 }}>
            {!di.length ? <div className="empty">入荷データなし</div> : (
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead><tr>
                    <th>区分</th><th>会社/名前</th><th>商品名</th>
                    <th style={{ textAlign: 'right' }}>個数</th><th style={{ textAlign: 'right' }}>単価</th>
                    <th style={{ textAlign: 'right' }}>金額</th><th>リコア</th><th>到着</th>
                  </tr></thead>
                  <tbody>
                    {di.map(x => (
                      <tr key={x.id} style={{ background: x.arrived ? '#EDF8F3' : undefined }}>
                        <td><span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 5, background: 'var(--inb-bg)', color: 'var(--inbound)', border: '1px solid var(--inb-bd)' }}>{x.inb_section === 'corporate' ? '企業' : x.inb_section === 'purchase' ? '買取' : '郵送'}</span></td>
                        <td>{x.company || '-'}</td>
                        <td style={{ fontWeight: 600 }}>{x.product_name || '-'}</td>
                        <td style={{ textAlign: 'right' }}>{x.qty}</td>
                        <td style={{ textAlign: 'right' }}>¥{fmt(x.unit_price)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--inbound)' }}>¥{fmt(x.amount)}</td>
                        <td style={{ textAlign: 'center' }}><input type="checkbox" checked={x.chk_liqoa} onChange={e => chkInb(x.id, 'chk_liqoa', e.target.checked)} style={{ accentColor: 'var(--inbound)', width: 14, height: 14 }} /></td>
                        <td style={{ textAlign: 'center' }}><input type="checkbox" checked={x.arrived} onChange={e => chkInb(x.id, 'arrived', e.target.checked)} style={{ accentColor: 'var(--success)', width: 14, height: 14 }} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
