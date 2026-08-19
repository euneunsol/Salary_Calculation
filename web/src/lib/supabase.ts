import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.types';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    '.env 파일에 VITE_SUPABASE_URL 과 VITE_SUPABASE_ANON_KEY 를 설정하세요. (.env.example 참고)',
  );
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
