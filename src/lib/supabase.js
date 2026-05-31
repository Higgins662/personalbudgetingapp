import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnon) {
  console.warn(
    '[supabase] Missing env vars. Copy .env.example → .env.local and fill in your project values.'
  )
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnon ?? '')
