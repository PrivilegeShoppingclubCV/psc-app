"use client";

import { useRef, useState } from "react";
import { IconCalendario } from "./Icons";
import { forma, useTesti } from "@/lib/i18n/client";
import type { TestiClient } from "@/lib/i18n/testi";

/**
 * Campo data che si può sia scrivere a mano (GG/MM/AAAA, le "/" si mettono da sole)
 * sia scegliere dal calendario del telefono (icona a destra).
 * Al server arriva sempre AAAA-MM-GG in un campo nascosto con il nome `id`,
 * quindi le azioni dei moduli non cambiano.
 */
export function CampoData({ id, label, help, defaultValue = "", min, max, required, autoComplete }: {
  id: string;
  label: string;
  help?: string;
  defaultValue?: string; // AAAA-MM-GG
  min?: string;
  max?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  const [testo, setTesto] = useState(() => daIso(defaultValue));
  const campo = useRef<HTMLInputElement>(null);
  const t = useTesti().data;
  const iso = aIso(testo);

  const aggiorna = (nuovo: string) => {
    setTesto(nuovo);
    campo.current?.setCustomValidity(errore(t, nuovo, min, max));
  };

  return (
    <div className="psc-field">
      <label className="psc-field__label" htmlFor={id}>{label}</label>
      <div className="campo-data" dir="ltr">
        <input
          ref={campo}
          id={id}
          type="text"
          inputMode="numeric"
          placeholder={t.formato}
          maxLength={10}
          autoComplete={autoComplete}
          required={required}
          className="psc-field__input"
          aria-describedby={help ? `${id}-help` : undefined}
          value={testo}
          onChange={(e) => {
            const v = e.target.value;
            // Incolla o compilazione automatica in AAAA-MM-GG: la convertiamo.
            if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return aggiorna(daIso(v));
            // Se si sta cancellando non rimettiamo la "/" appena tolta.
            const cancella = v.length < testo.length;
            aggiorna(cancella ? v : formatta(v));
          }}
          onBlur={() => campo.current?.reportValidity()}
        />
        <span className="campo-data__calendario">
          <IconCalendario />
          {/* Il selettore vero sta sopra l'icona, trasparente: toccandolo si apre il calendario del telefono. */}
          <input
            type="date"
            tabIndex={-1}
            aria-label={forma(t.calendario, { campo: label })}
            min={min}
            max={max}
            value={iso ?? ""}
            onChange={(e) => aggiorna(daIso(e.target.value))}
            onClick={(e) => {
              try { e.currentTarget.showPicker?.(); } catch { /* alcuni browser lo aprono da soli */ }
            }}
          />
        </span>
      </div>
      <input type="hidden" name={id} value={iso ?? ""} />
      {help && <span id={`${id}-help`} className="psc-field__help">{help}</span>}
    </div>
  );
}

/** Tiene solo le cifre e mette le "/" dopo giorno e mese: 12051990 → 12/05/1990. */
function formatta(v: string) {
  const c = v.replace(/\D/g, "").slice(0, 8);
  if (c.length <= 2) return c.length === 2 ? `${c}/` : c;
  if (c.length <= 4) return `${c.slice(0, 2)}/${c.slice(2)}${c.length === 4 ? "/" : ""}`;
  return `${c.slice(0, 2)}/${c.slice(2, 4)}/${c.slice(4)}`;
}

function daIso(v: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** GG/MM/AAAA → AAAA-MM-GG, solo se è una data che esiste davvero. */
function aIso(v: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (!m) return null;
  const [g, me, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(a, me - 1, g));
  if (a < 1900 || d.getUTCFullYear() !== a || d.getUTCMonth() !== me - 1 || d.getUTCDate() !== g) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function errore(t: TestiClient["data"], v: string, min?: string, max?: string) {
  if (!v) return "";
  const iso = aIso(v);
  if (!iso) return t.erroreFormato;
  if (max && iso > max) return forma(t.erroreDopo, { data: daIso(max) });
  if (min && iso < min) return forma(t.errorePrima, { data: daIso(min) });
  return "";
}
