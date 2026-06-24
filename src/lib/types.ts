export type Carrier = 'FedEx' | 'DHL' | 'ヤマト' | 'UPS' | '海外代行'
export type InbSection = 'corporate' | 'purchase' | 'postal'

export interface Shipment {
  id: string
  date: string           // 'YYYY-MM-DD'
  carrier: Carrier
  pack_no: number
  domestic: boolean
  order_note: string
  carry_over: string
  product_name: string
  qty: number
  unit_price: number
  weight: number
  total_weight: number
  tracking_no: string
  recipient: string
  agent: string
  remarks: string
  send_op: string
  freight: number
  amount: number
  invoice_no: string
  inventory_note: string
  chk_liqoa: boolean
  chk_pack: boolean
  created_at?: string
  updated_at?: string
}

export interface Inbound {
  id: string
  date: string
  inb_section: InbSection
  arrived: boolean
  chk_liqoa: boolean
  company: string
  product_name: string
  qty: number
  unit_price: number
  amount: number
  tracking_no: string
  recore_no: string
  payment_date: string
  remarks: string
  created_at?: string
  updated_at?: string
}

export const CARRIERS: Carrier[] = ['FedEx', 'DHL', 'ヤマト', 'UPS', '海外代行']

export const CARRIER_COLOR: Record<Carrier, string> = {
  FedEx:    '#A78BCA',
  DHL:      '#C4A030',
  ヤマト:    '#5BAD82',
  UPS:      '#B07850',
  海外代行:  '#6B9FD4',
}

export const CARRIER_BG: Record<Carrier, string> = {
  FedEx:    '#F5F0FC',
  DHL:      '#FEFBEE',
  ヤマト:    '#EDF8F3',
  UPS:      '#FBF5EF',
  海外代行:  '#EEF5FC',
}

export const INB_SECTION_LABEL: Record<InbSection, string> = {
  corporate: '企業仕入れ',
  purchase:  '買取',
  postal:    '郵送買取',
}

export const FEDEX_OPS = [
  'International Priority',
  'International Connect Plus',
  'Saturday Option',
]

export function fmt(n: number | string | null | undefined): string {
  return Number(n || 0).toLocaleString('ja-JP')
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function fmtDate(s: string): string {
  if (!s) return ''
  const [y, m, d] = s.split('-')
  return `${y}年${m}月${d}日`
}

export function fmtShort(s: string): string {
  if (!s) return ''
  const [, m, d] = s.split('-')
  return `${m}/${d}`
}

export function weekday(s: string): string {
  if (!s) return ''
  return '日月火水木金土'[new Date(s).getDay()] + '曜'
}
