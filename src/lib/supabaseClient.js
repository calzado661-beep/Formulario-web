import { createClient } from "@supabase/supabase-js";

const viteUrl = import.meta.env.VITE_SUPABASE_URL;
const vitePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const viteAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseUrl = viteUrl || __SUPABASE_URL__;
export const supabaseKey = vitePublishableKey || viteAnonKey || __SUPABASE_KEY__;
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })
  : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error(
      "Faltan VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en el archivo .env."
    );
  }
  return supabase;
}
