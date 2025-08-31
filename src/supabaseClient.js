import { createClient } from '@supabase/supabase-js'

// Pull values from your .env.local file
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY

// Export a single client to use everywhere in your app
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
