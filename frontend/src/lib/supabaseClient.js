import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
    console.warn(
        '[InsightFlow] Supabase environment variables are not set.\n' +
        'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to frontend/.env'
    )
}

export const supabase = createClient(supabaseUrl, supabaseKey)
