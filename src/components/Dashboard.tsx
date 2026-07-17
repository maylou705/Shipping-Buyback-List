'use client'
import { useState, useEffect } from 'react'
import { Shipment, Inbound, CARRIERS, CARRIER_COLOR, CARRIER_BG, fmt, fmtDate, weekday, todayStr } from '@/lib/types'
import { SupabaseClient } from '@supabase/supabase-js'
import { createQuoteClient } from '@/lib/supabase'
import { buildPackGroups } from './PackGroupTable'
import CarrierWorkPanel from './CarrierWorkPanel'
import InboundWorkPanel from './InboundWorkPanel'

interface Props {
  supabase: SupabaseClient
  date: string
  shipments: Shipment[]
  inbounds: Inbound[]
  reload: () => void
}

interface ProductInfo { code: string; name: string; recore_pd_code?: string | null; grade?: string; unit_type?: string }

export default function Dashboard({ supabase, shipments, inbounds, reload }: Props) {
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({})
  const [products, setProducts] = useState<ProductInfo[]>([])
  const [inventoryByPd, setInventoryByPd] = useState<Record<string, number>>({})
  const date = todayStr()

  // ── 商品マスタ・在庫を一括で読み込み、全パネルで共有 ──
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

  const ds = shipments.filter(s => s.date === date)
  const di = inbounds.filter(b => b.date === date)
  const tOut = ds.reduce((a, s) => a + (s.amount || 0), 0)
  const tIn  = di.reduce((a, b) => a + (b.amount || 0), 0)
  const aOut = shipments.reduce((a, s) => a + (s.amount || 0), 0)
  const aIn  = inbounds.reduce((a, b)  => a + (b.amount || 0), 0)

  const toggleOpen = (k: string) => setOpenMap(p => ({ ...p, [k]: !p[k] }))

  const inboundQtyMap: Record<string, number> = {}
  inbounds.forEach(b => { const k = (b.product_name || '').toLowerCase(); if (k) inboundQtyMap[k] = (inboundQtyMap[k] || 0) + (b.qty || 0) })

  const KPI = ({ label, val, sub, color }: { label: string; val: string; sub?: string; color?: string }) => (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: color || 'var(--text)' }}>{val}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{sub}</div>}
    </div>
  )

  const carrierStats = CARRIERS.map(carrier => {
    const cRows = ds.filter(s => s.carrier === carrier)
    const packs = buildPackGroups(cRows)
    const cTotal = cRows.reduce((a, r) => a + (r.amount || 0), 0)
    const allChk = cRows.length > 0 && cRows.every(r => r.chk_liqoa && r.chk_pack)
    return { carrier, cRows, packs, cTotal, allChk, hasData: packs.length > 0 }
  })
  const inbArrived = di.filter(x => x.arrived).length

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 800 }}>ダッシュボード</div>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>{fmtDate(date)}（{weekday(date)}）・チェックや入力はすべてこの画面で完結します</div>
        </div>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10, marginBottom: 18 }}>
        <KPI label="本日 出荷" val={`¥${fmt(tOut)}`} sub={`${ds.length}件`} color="var(--overseas)" />
        <KPI label="本日 入荷" val={`¥${fmt(tIn)}`}  sub={`${di.length}件`} color="var(--inbound)" />
        <KPI label="本日 粗利" val={`¥${fmt(tOut - tIn)}`} color={tOut >= tIn ? 'var(--success)' : 'var(--danger)'} />
        <KPI label="累計 出荷" val={`¥${fmt(aOut)}`} color="var(--overseas)" />
        <KPI label="累計 入荷" val={`¥${fmt(aIn)}`}  color="var(--inbound)" />
        <KPI label="累計 粗利" val={`¥${fmt(aOut - aIn)}`} color={aOut >= aIn ? 'var(--success)' : 'var(--danger)'} />
      </div>

      {/* ── 概要タイル：全種類を一目で。クリックで下の該当パネルが開閉 ── */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 6 }}>本日の状況（タップで開閉）</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 8, marginBottom: 20 }}>
        {carrierStats.map(({ carrier, packs, cRows, cTotal, allChk, hasData }) => {
          const col = CARRIER_COLOR[carrier]
          const key = `carrier_${carrier}`
          const isOpen = openMap[key] !== undefined ? openMap[key] : hasData
          return (
            <button key={carrier} onClick={() => toggleOpen(key)} style={{
              textAlign: 'left', cursor: 'pointer',
              border: `1.5px solid ${hasData ? col : (isOpen ? col : 'var(--border)')}`,
              borderRadius: 'var(--radius-sm)', padding: '8px 10px',
              background: hasData ? CARRIER_BG[carrier] : (isOpen ? CARRIER_BG[carrier] : 'var(--sf2)'),
              opacity: hasData || isOpen ? 1 : 0.55,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: hasData ? (allChk ? '#16a34a' : 'var(--warn)') : 'var(--text3)', flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 800, color: hasData || isOpen ? col : 'var(--text3)' }}>{carrier}</span>
              </div>
              {hasData ? (
                <>
                  <div style={{ fontSize: 13, fontWeight: 800, color: col }}>¥{fmt(cTotal)}</div>
                  <div style={{ fontSize: 10, color: 'var(--text2)' }}>{packs.length}梱包 / {cRows.length}商品</div>
                </>
              ) : (
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>タップして追加</div>
              )}
            </button>
          )
        })}
        <button onClick={() => toggleOpen('inbound')} style={{
          textAlign: 'left', cursor: 'pointer',
          border: `1.5px solid ${di.length ? 'var(--inbound)' : ((openMap['inbound'] ?? di.length > 0) ? 'var(--inbound)' : 'var(--border)')}`,
          borderRadius: 'var(--radius-sm)', padding: '8px 10px',
          background: di.length ? 'var(--inb-bg)' : ((openMap['inbound'] ?? di.length > 0) ? 'var(--inb-bg)' : 'var(--sf2)'),
          opacity: di.length || (openMap['inbound'] ?? false) ? 1 : 0.55,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: di.length ? (inbArrived === di.length ? '#16a34a' : 'var(--warn)') : 'var(--text3)', flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--inbound)' }}>入荷</span>
          </div>
          {di.length ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--inbound)' }}>¥{fmt(tIn)}</div>
              <div style={{ fontSize: 10, color: 'var(--text2)' }}>{di.length}件・到着{inbArrived}/{di.length}</div>
            </>
          ) : (
            <div style={{ fontSize: 10, color: 'var(--text3)' }}>タップして追加</div>
          )}
        </button>
      </div>

      {/* ── 各キャリアのパネル：データの有無に関わらず全種類を表示。開けばその場で追加・編集 ── */}
      {carrierStats.map(({ carrier, cRows, hasData }) => {
        const key = `carrier_${carrier}`
        const open = openMap[key] !== undefined ? openMap[key] : hasData
        return (
          <CarrierWorkPanel
            key={carrier}
            supabase={supabase}
            date={date}
            carrier={carrier}
            dayShips={cRows}
            inboundQtyMap={inboundQtyMap}
            reload={reload}
            products={products}
            inventoryByPd={inventoryByPd}
            open={open}
            onToggleOpen={() => toggleOpen(key)}
          />
        )
      })}

      <InboundWorkPanel
        supabase={supabase}
        date={date}
        di={di}
        reload={reload}
        products={products}
        inventoryByPd={inventoryByPd}
        open={openMap['inbound'] !== undefined ? openMap['inbound'] : di.length > 0}
        onToggleOpen={() => toggleOpen('inbound')}
      />
    </div>
  )
}
