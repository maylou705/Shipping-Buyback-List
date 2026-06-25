'use client'
import { useState, useRef, useEffect } from 'react'
import { Shipment, Carrier, CARRIERS, CARRIER_COLOR, FEDEX_OPS, fmt, fmtDate, weekday, uid } from '@/lib/types'
import { SupabaseClient } from '@supabase/supabase-js'
import { createEcClient } from '@/lib/supabase'
interface Props {
  supabase: SupabaseClient
  date: string
  shipments: Shipment[]
  reload: () => void
}

interface ItemRow { prod: string; qty: string; price: string; weight: string }
interface PackGroup { packNo: number; done: boolean; items: ItemRow[]; track: string; recv: string; rem: string; freight: string; op: string }

const mkItem = (): ItemRow => ({ prod: '', qty: '', price: '', weight: '0.3' })
const mkPack = (n: number): PackGroup => ({ packNo: n, done: false, items: [mkItem()], track: '', recv: '', rem: '', freight: '', op: '' })

function parseOrderLines(text: string) {
  return text.split('\n').map(l => {
    const m = l.match(/[¥￥]?([\d,]+)\s*[×xX×]\s*([\d,]+)/)
    if (m) {
      const price = parseInt(m[1].replace(/,/g, ''))
      const qty   = parseInt(m[2].replace(/,/g, ''))
      const label = l.replace(/[¥￥]?[\d,]+\s*[×xX×]\s*[\d,]+/, '').replace(/[-—–\s]+$/, '').trim()
      return { label, price, qty, sub: price * qty }
    }
    return { label: l, price: 0, qty: 0, sub: 0 }
  }).filter(r => r.label)
}

export default function ShipmentInput({ supabase, date, shipments, reload }: Props) {
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

  const [carrier,    setCarrier]    = useState<Carrier>('FedEx')
  const [domestic,   setDomestic]   = useState(false)
  const [orderNote,  setOrderNote]  = useState('')
  const [carryOver,  setCarryOver]  = useState('')
  const [recvGlobal, setRecvGlobal] = useState('')
  const [agentGlobal,setAgentGlobal]= useState('')
  const [packs,      setPacks]      = useState<PackGroup[]>([mkPack(1)])
  const lastOpRef = useRef('')
  const lastFrRef = useRef('')

  const col = CARRIER_COLOR[carrier]
  const isFedex = carrier === 'FedEx'
  const dayShips = shipments.filter(s => s.date === date && s.carrier === carrier)

  // 保存済みの商品名ごとの合計数量
  const savedQtyMap: Record<string, number> = {}
  dayShips.forEach(s => {
    const k = (s.product_name || '').toLowerCase()
    if (k) savedQtyMap[k] = (savedQtyMap[k] || 0) + (s.qty || 0)
  })

  const orderLines = parseOrderLines(orderNote)

  const updatePack = (i: number, patch: Partial<PackGroup>) =>
    setPacks(p => p.map((g, j) => j === i ? { ...g, ...patch } : g))
  const updateItem = (pi: number, ii: number, patch: Partial<ItemRow>) =>
    setPacks(p => p.map((g, j) => j !== pi ? g : { ...g, items: g.items.map((r, k) => k !== ii ? r : { ...r, ...patch }) }))

  const addItem = (pi: number) =>
    setPacks(p => p.map((g, j) => j !== pi ? g : { ...g, items: [...g.items, mkItem()] }))

  const addPack = () => {
    const max = Math.max(...packs.map(g => g.packNo))
    const prev = packs[packs.length - 1]
    setPacks(p => [...p, { ...mkPack(max + 1), op: lastOpRef.current, freight: lastFrRef.current }])
  }

  const dupPack = (pi: number) => {
    const src = packs[pi]
    const max = Math.max(...packs.map(g => g.packNo))
    setPacks(p => [...p, { ...src, packNo: max + 1, done: false, track: '' }])
  }

  const savePack = async (pi: number) => {
    const pack = packs[pi]
    const recv = pack.recv || recvGlobal
    const agent = agentGlobal
    if (pack.op) lastOpRef.current = pack.op
    if (pack.freight) lastFrRef.current = pack.freight

    // 同梱包の既存データを削除（上書き）
    await supabase.from('shipments')
      .delete()
      .eq('date', date).eq('carrier', carrier).eq('pack_no', pack.packNo)

    const rows = pack.items.filter(r => r.prod || +r.qty > 0)
    if (!rows.length) { alert('商品を入力してください'); return }

    await Promise.all(rows.map(r => supabase.from('shipments').insert({
      id: uid(), date, carrier, pack_no: pack.packNo, domestic,
      order_note: orderNote, carry_over: carryOver,
      product_name: r.prod, qty: +r.qty || 0,
      unit_price: +r.price || 0, weight: +r.weight || 0,
      total_weight: (+r.qty || 0) * (+r.weight || 0),
      tracking_no: pack.track, recipient: recv, agent,
      remarks: pack.rem, send_op: isFedex ? pack.op : '',
      freight: +pack.freight || 0,
      amount: (+r.qty || 0) * (+r.price || 0),
      invoice_no: '', inventory_note: '',
      chk_liqoa: false, chk_pack: false,
    })))

    reload()
    return true
  }

  const completePack = async (pi: number) => {
    const ok = await savePack(pi)
    if (!ok) return
    updatePack(pi, { done: true })
    const hasNext = packs.some((g, j) => j !== pi && !g.done)
    if (!hasNext) addPack()
  }

  const packTotal = (pack: PackGroup) => {
    const amt = pack.items.reduce((a, r) => a + (+r.qty || 0) * (+r.price || 0), 0)
    const w   = pack.items.reduce((a, r) => a + (+r.qty || 0) * (+r.weight || 0), 0)
    return { amt, w }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', height: 'calc(100vh - 52px)', overflow: 'hidden' }}>

      {/* 左: 元オーダーパネル */}
      <div style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* 宛先名・代行者名 */}
        <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div className="fg"><label>宛先名</label><input value={recvGlobal} onChange={e => setRecvGlobal(e.target.value)} placeholder="会社名 / 個人名" /></div>
          <div className="fg"><label>代行者名</label><input value={agentGlobal} onChange={e => setAgentGlobal(e.target.value)} placeholder="代行者名" /></div>
        </div>
        {/* 元オーダーヘッダ */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'var(--ov-bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--overseas)' }}>📋 元オーダー</span>
            <span style={{ display: 'flex', border: '1.5px solid var(--ov-bd)', borderRadius: 20, overflow: 'hidden', fontSize: 11, fontWeight: 700 }}>
              <button onClick={() => setDomestic(false)} style={{ padding: '3px 10px', border: 'none', cursor: 'pointer', background: !domestic ? 'var(--overseas)' : 'var(--ov-bg)', color: !domestic ? '#fff' : 'var(--overseas)' }}>海外</button>
              <button onClick={() => setDomestic(true)}  style={{ padding: '3px 10px', border: 'none', cursor: 'pointer', background:  domestic ? 'var(--yamato)' : 'var(--yam-bg)', color:  domestic ? '#fff' : 'var(--yamato)' }}>国内</button>
            </span>
          </div>
          <textarea value={orderNote} onChange={e => setOrderNote(e.target.value)} rows={8}
            placeholder={'例:\nAbyss Eye  12,800×3\nNinja Spinner  11,400×120'}
            style={{ width: '100%', background: 'var(--surface)', border: '1.5px solid var(--ov-bd)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', fontSize: 12, lineHeight: 1.85, resize: 'none', outline: 'none', color: 'var(--text)', fontFamily: 'inherit' }}
          />
        </div>
        {/* 残数プレビュー */}
        <div style={{ flex: 1, overflowY: 'auto', fontSize: 12 }}>
          {orderLines.length === 0
            ? <div style={{ padding: '14px', fontSize: 11, color: 'var(--text3)', textAlign: 'center' }}>元オーダーを入力すると残数を表示</div>
            : orderLines.map((line, i) => {
                const done = (() => {
                  let d = 0
                  const lk = line.label.toLowerCase()
                  Object.entries(savedQtyMap).forEach(([k, v]) => { if (lk && (k.includes(lk) || lk.includes(k))) d += v })
                  return d
                })()
                const rem = Math.max(0, line.qty - done)
                const pct = line.qty > 0 ? Math.min(100, Math.round(done / line.qty * 100)) : 0
                const allDone = rem === 0 && done > 0
                return (
                  <div key={i} style={{ padding: '7px 14px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, flex: 1 }}>{line.label || '—'}</span>
                      {line.qty > 0 && (
                        <span style={{ whiteSpace: 'nowrap', marginLeft: 8, fontSize: 11 }}>
                          <span style={{ color: 'var(--text2)' }}>{line.price.toLocaleString('ja-JP')}×{line.qty}</span>
                        </span>
                      )}
                    </div>
                    {line.qty > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: allDone ? 'var(--success)' : pct > 0 ? 'var(--overseas)' : 'var(--border)', borderRadius: 3, transition: '.3s' }} />
                        </div>
                        <span style={{ fontSize: 10, whiteSpace: 'nowrap', color: allDone ? 'var(--success)' : 'var(--text2)' }}>
                          {allDone ? '✓ 完了' : done > 0 ? `済${done} / 残${rem}` : `${line.qty}個`}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })
          }
        </div>
        {/* 残り・持ち越し */}
        <div style={{ borderTop: '1px solid var(--border)', padding: '10px 14px', background: '#FEFBEC' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--warn)', marginBottom: 5 }}>⚠ 残り・持ち越し</div>
          <textarea value={carryOver} onChange={e => setCarryOver(e.target.value)} rows={2}
            placeholder="例: ninja 残91個→翌日"
            style={{ width: '100%', background: 'var(--surface)', border: '1.5px solid #EEE098', borderRadius: 'var(--radius-sm)', padding: '6px 9px', fontSize: 12, resize: 'none', outline: 'none', color: 'var(--text)', fontFamily: 'inherit' }}
          />
        </div>
      </div>

      {/* 右: 梱包入力 */}
      <div style={{ overflowY: 'auto', padding: '16px 18px' }}>
        {/* 配送会社タブ */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
          {CARRIERS.map(c => (
            <button key={c} onClick={() => setCarrier(c)} style={{
              padding: '6px 14px', borderRadius: 'var(--radius-sm)',
              border: `1.5px solid ${c === carrier ? CARRIER_COLOR[c] : 'var(--border)'}`,
              background: c === carrier ? 'var(--sf2)' : 'var(--surface)',
              color: c === carrier ? CARRIER_COLOR[c] : 'var(--text2)',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>
              {c}
            </button>
          ))}
        </div>

        {/* 梱包カード */}
        {packs.map((pack, pi) => {
          const { amt, w } = packTotal(pack)
          const savedRows = dayShips.filter(s => s.pack_no === pack.packNo)

          if (pack.done) {
            // 完了済み（縮む）
            return (
              <div key={pack.packNo} style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 10, overflow: 'hidden' }}>
                <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => updatePack(pi, { done: false })}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: col }}>梱包 {pack.packNo}</span>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: '#EDF8F3', color: '#16a34a', border: '1px solid #AADDC2' }}>✓ 完了</span>
                  <span style={{ fontSize: 11, color: 'var(--text2)' }}>
                    {savedRows.length}商品 / <strong style={{ color: col }}>¥{fmt(savedRows.reduce((a, r) => a + (r.amount || 0), 0))}</strong>
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text3)' }}>▶ 展開</span>
                  <button onClick={e => { e.stopPropagation(); dupPack(pi) }} style={{ fontSize: 10, padding: '2px 8px', border: '1px solid var(--ov-bd)', borderRadius: 4, background: 'var(--ov-bg)', cursor: 'pointer', color: 'var(--overseas)' }}>複製</button>
                </div>
                <div style={{ padding: '0 14px 8px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {savedRows.map(r => (
                    <span key={r.id} style={{ fontSize: 11, background: 'var(--sf2)', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 8px', color: 'var(--text2)' }}>
                      {r.product_name} ×{r.qty} <span style={{ color: col }}>¥{fmt((r.qty || 0) * (r.unit_price || 0))}</span>
                    </span>
                  ))}
                </div>
              </div>
            )
          }

          // 入力中
          return (
            <div key={pack.packNo} style={{ background: 'var(--surface)', border: `2px solid ${col}`, borderRadius: 'var(--radius)', marginBottom: 12, overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,.06)' }}>
              {/* ヘッダ */}
              <div style={{ background: 'var(--sf2)', borderBottom: '1px solid var(--border)', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: col }}>梱包 {pack.packNo}</span>
                {(amt > 0 || w > 0) && <span style={{ fontSize: 11, color: 'var(--text2)' }}>商品計 <strong style={{ color: col }}>¥{fmt(amt)}</strong> / {w.toFixed(2)}kg</span>}
                {packs.length > 1 && (
                  <button onClick={() => setPacks(p => p.filter((_, j) => j !== pi))} style={{ marginLeft: 'auto', fontSize: 10, padding: '2px 8px', border: '1px solid var(--border)', borderRadius: 4, background: 'none', cursor: 'pointer', color: 'var(--text3)' }}>削除</button>
                )}
              </div>

              {/* 共通情報 */}
              <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: `1fr 1fr 1fr 80px${isFedex ? ' 2fr' : ''}`, gap: 10, borderBottom: '1px solid var(--border)' }}>
                <div className="fg"><label>問番</label><input value={pack.track} onChange={e => updatePack(pi, { track: e.target.value })} placeholder="追跡番号" /></div>
                <div className="fg">
                  <label>宛先名 <span style={{ fontSize: 9, color: 'var(--text3)' }}>空=左パネル</span></label>
                  <input value={pack.recv} onChange={e => updatePack(pi, { recv: e.target.value })} placeholder="上書きのみ" />
                </div>
                <div className="fg"><label>備考</label><input value={pack.rem} onChange={e => updatePack(pi, { rem: e.target.value })} placeholder="備考" /></div>
                <div className="fg"><label>送料 (¥)</label><input type="number" value={pack.freight} onChange={e => { updatePack(pi, { freight: e.target.value }); lastFrRef.current = e.target.value }} placeholder="0" /></div>
                {isFedex && (
                  <div className="fg">
                    <label>発送OP</label>
                    <select value={pack.op} onChange={e => { updatePack(pi, { op: e.target.value }); lastOpRef.current = e.target.value }}>
                      <option value="">選択</option>
                      {FEDEX_OPS.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {/* 商品行 */}
              {pack.items.map((item, ii) => (
                <div key={ii} style={{ display: 'grid', gridTemplateColumns: '2fr 60px 80px 70px 80px', gap: 6, padding: '8px 14px', borderBottom: '1px solid var(--border)', alignItems: 'end' }}>
                  <div className="fg" style={{ position: 'relative' }}>
  <label>{ii === 0 ? '商品名' : `商品名 ${ii + 1}`}</label>
  <input
    value={item.prod}
    onChange={e => { updateItem(pi, ii, { prod: e.target.value }); setProdSearch(e.target.value) }}
    onFocus={e => setProdSearch(e.target.value)}
    onBlur={() => setTimeout(() => setProdSearch(''), 200)}
    placeholder="商品名またはコードで検索..."
  />
  {filtered.length > 0 && item.prod === prodSearch && (
    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface)', border: '1.5px solid var(--overseas)', borderRadius: 'var(--radius-sm)', zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,.1)', maxHeight: 220, overflowY: 'auto' }}>
      {filtered.map(p => (
        <div key={p.code}
          onMouseDown={() => { updateItem(pi, ii, { prod: p.name }); setProdSearch('') }}
          style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--ov-bg)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          <span style={{ fontSize: 10, color: 'var(--text3)', minWidth: 60 }}>{p.code}</span>
          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{p.name}</span>
        </div>
      ))}
    </div>
  )}
</div>
                  <div className="fg"><label>個数</label><input type="number" value={item.qty} onChange={e => updateItem(pi, ii, { qty: e.target.value })} placeholder="0" /></div>
                  <div className="fg"><label>単価 (¥)</label><input type="number" value={item.price} onChange={e => updateItem(pi, ii, { price: e.target.value })} placeholder="0" /></div>
                  <div className="fg"><label>重量 (kg)</label><input type="number" value={item.weight} onChange={e => updateItem(pi, ii, { weight: e.target.value })} step="0.01" placeholder="0.3" /></div>
                  <div className="fg">
                    <label>小計 <span style={{ fontSize: 9, color: 'var(--text3)' }}>自動</span></label>
                    <input readOnly value={(+item.qty || 0) * (+item.price || 0) || ''} style={{ background: 'var(--sf2)', color: col, fontWeight: 700, borderStyle: 'dashed' }} />
                  </div>
                </div>
              ))}

              {/* フッター */}
              <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--sf2)', borderTop: '1px solid var(--border)' }}>
                <button onClick={() => addItem(pi)} style={{ fontSize: 11, padding: '4px 12px', border: '1.5px dashed var(--border2)', borderRadius: 'var(--radius-sm)', background: 'none', cursor: 'pointer', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                  ＋ 商品行を追加
                </button>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button onClick={() => updatePack(pi, { items: [mkItem()], track: '', recv: '', rem: '' })} className="btn btn-outline btn-sm">クリア</button>
                  <button onClick={() => completePack(pi)} style={{ padding: '8px 22px', background: col, color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    完了 ✓
                  </button>
                </span>
              </div>
            </div>
          )
        })}

        {/* 梱包追加ボタン */}
        <button onClick={addPack} style={{ width: '100%', padding: 10, border: '2px dashed var(--border2)', borderRadius: 'var(--radius)', background: 'none', color: 'var(--text2)', fontSize: 12, fontWeight: 700, cursor: 'pointer', marginBottom: 14 }}>
          ＋ 梱包を追加
        </button>

        {/* ダッシュボードへ */}
        <button onClick={() => window.location.reload()} style={{ display: 'none' }} />
      </div>
    </div>
  )
}
