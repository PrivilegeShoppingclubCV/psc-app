// Le variabili arrivano da .env.local in locale e dalle Environment Variables di Vercel.
// Finché il progetto Supabase non esiste restano vuote e l'app usa i dati finti.
// L'integrazione Supabase di Vercel può creare la chiave pubblica con il nome nuovo
// (NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, sb_publishable_...) invece di ANON_KEY:
// vanno bene tutte e due.
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
