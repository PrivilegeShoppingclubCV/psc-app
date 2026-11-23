"use server";

import { cookies } from "next/headers";
import { COOKIE_LINGUA, isLingua } from "@/lib/i18n/lingue";
import { richiediAdmin } from "@/lib/admin/sessione";

/**
 * Lingua di prova per l'admin: cambia solo il cookie di questo browser, così
 * le pagine dell'app si aprono in quella lingua. A differenza del menu dei
 * soci non tocca i dati dell'account, quindi le email di accesso dell'admin
 * restano nella sua lingua.
 */
export async function linguaDiProva(lingua: string) {
  await richiediAdmin();
  if (!isLingua(lingua)) return;
  (await cookies()).set(COOKIE_LINGUA, lingua, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}
