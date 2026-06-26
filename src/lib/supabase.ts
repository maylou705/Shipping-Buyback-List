import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export function createClient() {
  return createSupabaseClient(
    'https://qxixwutaemssjmawsjft.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4aXh3dXRhZW1zc2ptYXdzamZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMzY3NTYsImV4cCI6MjA5NzkxMjc1Nn0.5W7IUmF_XmoBR1RZuMVTx7MkRap9IWXgrOqs7y6eyJE'
  )
}

export function createEcClient() {
  return createSupabaseClient(
    'https://xiclvtzoakjvulnsesqd.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpY2x2dHpvYWtqdnVsbnNlc3FkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMTM4ODQsImV4cCI6MjA4ODg4OTg4NH0.pdgyLvMi958xurCdTBqau2iYDEy_CW4X5Lxy4dkAdGA'
  )
}
