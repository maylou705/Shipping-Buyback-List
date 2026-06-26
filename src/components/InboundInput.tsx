'use client'
import { useState, useEffect } from 'react'
import { Inbound, InbSection, INB_SECTION_LABEL, fmt, fmtDate, weekday, uid } from '@/lib/types'
import { SupabaseClient } from '@supabase/supabase-js'
import { createEcClient } from '@/lib/supabase'

interface Props {
  supabase: SupabaseClient
  date: string
  inbounds: Inbound[]
  reload: () => void
}

const SEC_COLOR: Record<InbSection, string> = { corporate: 'var(--yamato)', purchase: 'var(--inbound)', postal: 'var(--overseas)' }
const SEC_BG:    Record<InbSection, string> = { corporate: 'var(--yam-bg)', purchase: 'var(--inb-bg)',  postal: 'var(--ov-bg)' }
const SEC_BD:    Record<InbSection, string> = { corporate: 'var(--yam-bd)', purchase: 'var(--inb-bd)',  postal: 'var(--ov-bd)' }

interface ItemRow { prod: string; qty: string; price: string }

export default function InboundInput({ supabase, date, inbounds, reload }: Props) {
  const [products, setProducts] = useState<{code: string; name: string}[]>([])
  const [prodSearch, setProdSearch] = useState('')

  useEffect(() => {
    const ec = createEcClient()
    ec.from('product_codes').select('code, name').order('code').then(({ data }) => {
      if (data) setProducts(data)
    })
  }, [])

  const filtered = prodSearch.length >= 1
    ? products.filter(p =>
        p.code.toLowerCase().includes(prodSearch.toLowerCase()) ||
        p.name.toLowerCase().includes(prodSearch.toLowerCase())
      ).slice(0, 8)
    : []

  const [section, setSection] = useState<InbSection>('corporate')
  const [company, setCompany] = useState('')
  const [payDate, setPayDate] = useState('')
  const [track,   setTrack]   = useState('')
  const [rem,     setRem]     = useState('')
  const [items,   setItems]   = useState<ItemRow[]>([{ prod: '', qty: '', price: '' }])

  const di = inbounds.filter(b => b.date === date)
  const tIn = di.reduce((a, b) => a + (b.amount || 0), 0)
  const col = SEC_COLOR[section]
  const bg  = SEC_BG[section]
  const bd  = SEC_BD[section]

  const addItem = () => setItems(p => [...p, { prod: '', qty: '', price: '' }])
  const setItem = (i: number, k: keyof ItemRow, v: string) => setItems(p => p.map((r, j) => j === i ? { ...r, [k]: v } : r))

  const total = items.reduce((a, r) => a + (+r.qty || 0) * (+r.price || 0), 0)

  const save = async () => {
    if (section === 'postal' && !track) { alert('郵送買取は問番が必須です'); return }
    const rows = items.filter(r => r.prod || +r.qty > 0)
    if (!rows.length) { alert('商品を入力してください'); return }
    await Promise.all(rows.map(r => supabase.from('inbounds').insert({
      id: uid(), date, inb_section: section,
      arrived: false, chk_liqoa: false,
      company, product_name: r.prod,
      qty: +r.qty || 0, unit_price: +r.price || 0,
      amount: (+r.qty || 0) * (+r.price || 0),
      tracking_no: track, payment_date: payDate || null,
      remarks: rem, recore_no: '',
    })))
    reload()
    setItems([{ prod: '', qty: '', price: '' }])
    setCompany(''); setPayDate(''); setTrack(''); setRem('')
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', height: 'calc(100vh - 52px)', overflow: 'hidden' }}>

      {/* 左パネル */}
      <div style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--inb-bg)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--inbound)', marginBottom: 4 }}>📥 本日の入荷</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--inbound)' }}>¥{fmt(tIn)}</div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{di.length}件</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {!di.length ? (
            <div style={{ padding: '20px 16px', fontSize: 11, color: 'var(--text3)', textAlign: 'center' }}>まだデータがありません</div>
          ) : (['corporate', 'purchase', 'postal'] as InbSection[]).map(sec => {
            const secItems = di.filter(x => x.inb_section === sec)
            if (!secItems.length) return null
            return (
              <div key={sec} style={{ borderBottom: '1px solid var(--border)' }}>
                <div style={{ padding: '5px 14px', background: 'var(--sf2)', fontSize: 10, fontWeight: 700, color: 'var(--text2)' }}>
                  {INB_SECTION_LABEL[sec]}
                </div>
                {secItems.map(x => (
                  <div key={x.id} style={{ padding: '7px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', flex: 1, minWidth: 0 }}>
                      <input type="checkbox" checked={x.arrived}
                        onChange={async e => { await supabase.from('inbounds').update({ arrived: e.target.checked }).eq('id', x.id); reload() }}
                        style={{ width: 16, height: 16, accentColor: 'var(--inbound)', flexShrink: 0 }} />
                      <span style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {x.company || '-'}
                      </span>
                    </label>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--inbound)', whiteSpace: 'nowrap' }}>¥{fmt(x.amount)}</span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
        {di.length > 0 && (
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', background: 'var(--sf2)' }}>
            <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 2 }}>到着済み</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--success)' }}>
              {di.filter(x => x.arrived).length}件 / ¥{fmt(di.filter(x => x.arrived).reduce((a, x) => a + (x.amount || 0), 0))}
            </div>
          </div>
        )}
      </div>

      {/* 右エリア */}
      <div style={{ overflowY: 'auto', padding: '18px 20px' }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 19, fontWeight: 800 }}>入荷入力</div>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>{fmtDate(date)}（{weekday(date)}）</div>
        </div>

        {/* タブ */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
          {(['corporate', 'purchase', 'postal'] as InbSection[]).map(sec => (
            <button key={sec} onClick={() => setSection(sec)} style={{
              padding: '7px 18px', borderRadius: 'var(--radius-sm)',
              border: `1.5px solid ${section === sec ? SEC_COLOR[sec] : 'var(--border)'}`,
              background: section === sec ? SEC_BG[sec] : 'var(--surface)',
              color: section === sec ? SEC_COLOR[sec] : 'var(--text2)',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>
              {INB_SECTION_LABEL[sec]}
            </button>
          ))}
        </div>

        {/* フォーム */}
        <div style={{ background: 'var(--surface)', border: `1.5px solid ${bd}`, borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <div style={{ padding: '9px 16px', background: bg, borderBottom: `1px solid ${bd}`, fontSize: 12, fontWeight: 700, color: col }}>
            {INB_SECTION_LABEL[section]} 入力
          </div>
          <div style={{ padding: '14px 16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 10, marginBottom: 12 }}>
              <div className="fg">
                <label>{section === 'corporate' ? '会社名' : '買取者名'}</label>
                <input value={company} onChange={e => setCompany(e.target.value)} placeholder={section === 'corporate' ? '会社名' : '個人名または会社名'} />
              </div>
              <div className="fg"><label>支払日</label><input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} /></div>
              {section === 'postal' && (
                <div className="fg">
                  <label>問番 <span style={{ color: 'var(--danger)', fontSize: 10 }}>必須</span></label>
                  <input value={track} onChange={e => setTrack(e.target.value)} placeholder="追跡番号" />
                </div>
              )}
              <div className="fg" style={{ gridColumn: '1/-1' }}>
                <label>備考</label>
                <textarea value={rem} onChange={e => setRem(e.target.value)} style={{ minHeight: 44, resize: 'vertical' }} />
              </div>
            </div>

            {/* 商品明細 */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', marginBottom: 12 }}>
              <div style={{ background: 'var(--sf2)', padding: '6px 12px', fontSize: 10, fontWeight: 700, color: 'var(--text2)' }}>商品明細</div>
              {items.map((item, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 60px 90px 90px', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--border)', alignItems: 'end' }}>
                  <div className="fg" style={{ position: 'relative' }}>
  <label>{i === 0 ? '商品名' : `商品名 ${i + 1}`}</label>
                    <input
  value={item.prod}
  onChange={e => { setItem(i, 'prod', e.target.value); setProdSearch(e.target.value) }}
  onFocus={e => setProdSearch(e.target.value)}
  onBlur={() => setTimeout(() => setProdSearch(''), 200)}
  placeholder="商品名またはコードで検索..."
/>
{filtered.length > 0 && item.prod === prodSearch && (
  <div style={{ position: 'absolute', top: '100%', left: 0, minWidth: 320, background: 'var(--surface)', border: '1.5px solid var(--inbound)', borderRadius: 'var(--radius-sm)', zIndex: 1000, boxShadow: '0 4px 12px rgba(0,0,0,.1)', maxHeight: 400, overflowY: 'auto' }}>
    {filtered.map(p => (
      <div key={p.code}
        onMouseDown={() => { setItem(i, 'prod', p.name); setProdSearch('') }}
        style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--inb-bg)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
      >
        <span style={{ fontSize: 10, color: 'var(--text3)', minWidth: 60 }}>{p.code}</span>
        <span style={{ color: 'var(--text)', fontWeight: 600 }}>{p.name}</span>
      </div>
    ))}
  </div>
)}
                  </div>
                  <div className="fg"><label>個数</label><input type="number" value={item.qty} onChange={e => setItem(i, 'qty', e.target.value)} placeholder="0" /></div>
                  <div className="fg"><label>単価 (¥)</label><input type="number" value={item.price} onChange={e => setItem(i, 'price', e.target.value)} placeholder="0" /></div>
                  <div className="fg">
                    <label>小計 <span style={{ fontSize: 9, color: 'var(--text3)' }}>自動</span></label>
                    <input readOnly value={(+item.qty || 0) * (+item.price || 0) || ''} style={{ background: 'var(--sf2)', color: col, fontWeight: 700, borderStyle: 'dashed' }} />
                  </div>
                </div>
              ))}
              <div style={{ padding: '8px 12px', background: 'var(--sf2)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <button onClick={addItem} style={{ fontSize: 11, padding: '4px 12px', border: '1.5px dashed var(--border2)', borderRadius: 'var(--radius-sm)', background: 'none', cursor: 'pointer', color: 'var(--text2)' }}>
                  ＋ 商品行を追加
                </button>
                {total > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: col }}>合計 ¥{fmt(total)}</span>}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-outline" onClick={() => { setItems([{ prod: '', qty: '', price: '' }]); setCompany(''); setPayDate(''); setTrack(''); setRem('') }}>クリア</button>
              <button onClick={save} style={{ padding: '8px 22px', background: col, color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                保存する
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
