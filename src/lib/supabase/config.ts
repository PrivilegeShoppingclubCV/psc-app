// Le variabili arrivano da .env.local in locale e dalle Environment Variables di Vercel.
// Finché il progetto Supabase non esiste restano vuote e l'app usa i dati finti.
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
