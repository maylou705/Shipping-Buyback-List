'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { Shipment, Inbound, todayStr } from '@/lib/types'
import Header from './Header'
import Sidebar from './Sidebar'
import Dashboard from './Dashboard'
import ShipmentInput from './ShipmentInput'
import InboundInput from './InboundInput'
import ListView from './ListView'
import Analytics from './Analytics'

export type View = 'dashboard' | 'shipment' | 'inbound' | 'list' | 'analytics'

export default function AppShell() {
  const supabase = createClient()
  const [view, setView]           = useState<View>('dashboard')
  const [date, setDate]           = useState(todayStr())
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [inbounds, setInbounds]   = useState<Inbound[]>([])
  const [loading, setLoading]     = useState(true)

  // ── データ読み込み ──
  const load = useCallback(async () => {
    const [{ data: s }, { data: b }] = await Promise.all([
      supabase.from('shipments').select('*').order('created_at'),
      supabase.from('inbounds').select('*').order('created_at'),
    ])
    setShipments(s ?? [])
    setInbounds(b ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  // ── リアルタイム同期 ──
  useEffect(() => {
    const channel = supabase
      .channel('db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shipments' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inbounds'  }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, load])

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'var(--text2)' }}>
      読み込み中...
    </div>
  )

  const props = { supabase, date, setDate, shipments, inbounds, reload: load }

  return (
    <div style={{ display:'grid', gridTemplateRows:'52px 1fr', minHeight:'100vh' }}>
      <Header view={view} setView={setView} />
      <div style={{ display:'grid', gridTemplateColumns:'190px 1fr', height:'calc(100vh - 52px)', overflow:'hidden' }}>
        <Sidebar date={date} setDate={setDate} shipments={shipments} inbounds={inbounds} />
        <main style={{ overflowY:'auto', padding: view === 'shipment' || view === 'inbound' ? '0' : '20px 24px' }}>
          {view === 'dashboard' && <Dashboard {...props} />}
          {view === 'shipment'  && <ShipmentInput {...props} />}
          {view === 'inbound'   && <InboundInput {...props} />}
          {view === 'list'      && <ListView {...props} />}
          {view === 'analytics' && <Analytics {...props} />}
        </main>
      </div>
    </div>
  )
}
