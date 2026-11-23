import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config";

/**
 * Rinnova la sessione Supabase a ogni richiesta e riscrive i cookie aggiornati.
 * Le pagine leggono la sessione da sole (src/lib/dati.ts): qui non si reindirizza nessuno.
 */
export async function proxy(request: NextRequest) {
  if (!isSupabaseConfigured) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });
  // Rinnova il token se è scaduto; altrimenti lo verifica in locale (nessuna chiamata ad Auth).
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  // Tutto tranne gli endpoint del gestionale (niente sessione), file statici, logo, icone, font e service worker.
  matcher: ["/((?!api/gestionale/|_next/static|_next/image|brand/|icons/|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|webp|ico|woff2)$).*)"],
};
