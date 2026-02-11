import { createClient } from '@supabase/supabase-js';

// Secrets are injected as VITE_ prefixed env vars for client-side access
const supabaseUrl = import.meta.env.VITE_EXTERNAL_SUPABASE_URL 
  || (typeof process !== 'undefined' && process.env?.EXTERNAL_SUPABASE_URL)
  || '';
const supabaseAnonKey = import.meta.env.VITE_EXTERNAL_SUPABASE_ANON_KEY 
  || (typeof process !== 'undefined' && process.env?.EXTERNAL_SUPABASE_ANON_KEY)
  || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase credentials not configured. Please ensure VITE_EXTERNAL_SUPABASE_URL and VITE_EXTERNAL_SUPABASE_ANON_KEY are set as environment variables.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
