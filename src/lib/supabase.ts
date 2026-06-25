import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export function createEcClient() {
  return createBrowserClient(
    'https://xiclvtzoakjvulnsesqd.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpY2x2dHpvYWtqdnVsbnNlc3FkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMTM4ODQsImV4cCI6MjA4ODg4OTg4NH0.pdgyLvMi958xurCdTBqau2iYDEy_CW4X5Lxy4dkAdGA'
  )
}
