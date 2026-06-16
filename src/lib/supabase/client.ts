import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/supabase/types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL2;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY2;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables.');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
