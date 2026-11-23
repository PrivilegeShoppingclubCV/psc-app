"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconChiudi, IconFotocamera } from "./Icons";
import { forma, useTesti } from "@/lib/i18n/client";

type Rilevato = { rawValue: string; format: string };
type Rilevatore = { detect: (img: HTMLVideoElement) => Promise<Rilevato[]> };

// Formati di codice a barre più usati per le tessere fedeltà.
const FORMATI = ["ean_13", "upc_a", "code_128", "ean_8", "code_39", "itf", "codabar"];

/**
 * Prepara il lettore di codici a barre: quello del telefono se c'è (Android/Chrome),
 * altrimenti un lettore che gira nella pagina (iPhone/Safari). Il file del lettore
 * è servito dalla nostra app (public/zxing), non da siti esterni.
 */
async function creaRilevatore(): Promise<Rilevatore> {
  const nativo = (globalThis as { BarcodeDetector?: { new (o: { formats: string[] }): Rilevatore; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
  if (nativo) {
    try {
      const supportati = (await nativo.getSupportedFormats?.()) ?? FORMATI;
      const formati = FORMATI.filter((f) => supportati.includes(f));
      if (formati.length) return new nativo({ formats: formati });
    } catch {
      // si passa al lettore nella pagina
    }
  }
  const { BarcodeDetector, prepareZXingModule } = await import("barcode-detector/ponyfill");
  prepareZXingModule({
    overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? "/zxing/zxing_reader-3.1.6.wasm" : prefix + path) },
  });
  return new BarcodeDetector({ formats: FORMATI as never }) as unknown as Rilevatore;
}

/** Cifra di controllo EAN-13 corretta? */
function ean13Valido(c: string) {
  const somma = [...c.slice(0, 12)].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
  return (10 - (somma % 10)) % 10 === Number(c[12]);
}

/**
 * Dal codice letto al numero della tessera. I numeri delle tessere hanno 12 cifre:
 * se il codice è stampato come EAN-13, la 13ª cifra è solo di controllo e si toglie.
 */
export function numeroDaCodice({ rawValue, format }: Rilevato) {
  const v = rawValue.replace(/\s/g, "");
  if (format === "ean_13" && /^\d{13}$/.test(v) && ean13Valido(v)) return v.slice(0, 12);
  return v;
}

/** Le tessere hanno sempre 12 cifre, con gli zeri davanti. */
export const CIFRE_TESSERA = 12;

/**
 * Da quello che scrive (o incolla) il socio alle sole cifre "significative":
 * niente spazi, lettere o zeri iniziali, al massimo 12 cifre.
 */
export function cifreSignificative(valore: string) {
  const tutte = valore.replace(/\D/g, "");
  const c = tutte.replace(/^0+/, "");
  // Solo se senza zeri restano più di 12 cifre: "0000000004169" (uno zero in più)
  // è un EAN-13 valido per caso, ma il numero giusto è 4169.
  if (c.length > CIFRE_TESSERA && tutte.length === 13 && ean13Valido(tutte)) return tutte.slice(0, CIFRE_TESSERA).replace(/^0+/, "");
  return c.slice(0, CIFRE_TESSERA);
}

/**
 * Campo "numero tessera": il socio può scrivere 4169, 04169 o 000000004169 (gli
 * zeri che scrive restano nel campo) e vede comparire sotto il numero completo a
 * 12 cifre (000000004169), che è quello
 * inviato. C'è anche il bottone per leggere il codice a barre con la fotocamera.
 */
export function CampoTessera({ id, label, help, defaultValue, required }: { id: string; label: string; help?: string; defaultValue?: string; required?: boolean }) {
  const campo = useRef<HTMLInputElement>(null);
  const t = useTesti().tessera;
  // Quello che si vede nel campo: solo cifre, zeri compresi.
  const [scritto, setScritto] = useState(() => String(defaultValue ?? "").replace(/\D/g, ""));
  const cifre = cifreSignificative(scritto);
  const troppe = scritto.replace(/^0+/, "").length > CIFRE_TESSERA && cifre.length === CIFRE_TESSERA && !(scritto.length === 13 && ean13Valido(scritto));
  const completo = cifre ? cifre.padStart(CIFRE_TESSERA, "0") : "";
  const zeri = CIFRE_TESSERA - cifre.length;
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const flusso = useRef<MediaStream | null>(null);
  const attivo = useRef(false);
  const [puoScansionare, setPuoScansionare] = useState(false);
  const [stato, setStato] = useState<"avvio" | "cerco" | "errore">("avvio");
  const [errore, setErrore] = useState("");

  useEffect(() => setPuoScansionare(!!navigator.mediaDevices?.getUserMedia), []);

  const ferma = useCallback(() => {
    attivo.current = false;
    flusso.current?.getTracks().forEach((t) => t.stop());
    flusso.current = null;
  }, []);

  useEffect(() => ferma, [ferma]);

  const chiudi = () => dialog.current?.close();

  const apri = async () => {
    setErrore("");
    setStato("avvio");
    dialog.current?.showModal();
    attivo.current = true;
    try {
      const [rilevatore, stream] = await Promise.all([
        creaRilevatore(),
        navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }),
      ]);
      if (!attivo.current) { stream.getTracks().forEach((t) => t.stop()); return; }
      flusso.current = stream;
      const v = video.current!;
      v.srcObject = stream;
      await v.play();
      setStato("cerco");

      const cerca = async () => {
        if (!attivo.current) return;
        try {
          if (v.readyState >= 2) {
            const [primo] = await rilevatore.detect(v);
            const numero = primo && numeroDaCodice(primo);
            if (numero && attivo.current) {
              setScritto(numero.replace(/\D/g, ""));
              campo.current?.setCustomValidity("");
              navigator.vibrate?.(80);
              chiudi();
              campo.current?.focus();
              return;
            }
          }
        } catch {
          // fotogramma non leggibile: si riprova
        }
        setTimeout(cerca, 150);
      };
      cerca();
    } catch (e) {
      const nome = (e as { name?: string })?.name;
      setStato("errore");
      setErrore(
        nome === "NotAllowedError" || nome === "SecurityError"
          ? t.permesso
          : nome === "NotFoundError" || nome === "OverconstrainedError"
            ? t.nessunaFotocamera
            : t.nonSiApre,
      );
      ferma();
    }
  };

  return (
    <div className="psc-field">
      <label className="psc-field__label" htmlFor={id}>{label}</label>
      <input
        ref={campo}
        id={id}
        className="psc-field__input"
        inputMode="numeric"
        autoComplete="off"
        placeholder={t.esempio}
        dir="ltr"
        required={required}
        aria-describedby={`${id}-numero${help ? ` ${id}-help` : ""}`}
        maxLength={20}
        value={scritto}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "").slice(0, 20);
          setScritto(v);
          const n = cifreSignificative(v);
          e.target.setCustomValidity(
            v && !n ? t.soloZeri
            : v.replace(/^0+/, "").length > CIFRE_TESSERA && !(v.length === 13 && ean13Valido(v)) ? t.massimo : "",
          );
        }}
      />
      {/* Il numero inviato è sempre quello completo, con gli zeri. */}
      <input type="hidden" name={id} value={completo} />
      <p id={`${id}-numero`} className="tessera-numero" aria-live="polite">
        {troppe ? (
          <>{forma(t.troppe, { n: CIFRE_TESSERA })}</>
        ) : completo ? (
          <>
            {t.latua} <span className="tessera-numero__cifre" dir="ltr"><span className="tessera-numero__zeri">{"0".repeat(zeri)}</span>{cifre}</span>
          </>
        ) : (
          <>{forma(t.completo, { n: CIFRE_TESSERA })}</>
        )}
      </p>
      {help && <span id={`${id}-help`} className="psc-field__help">{help}</span>}
      {puoScansionare && (
        <button type="button" className="psc-btn psc-btn--secondary scansiona-btn" onClick={apri}>
          <IconFotocamera />
          {t.scansiona}
        </button>
      )}

      <dialog ref={dialog} className="tessera-overlay" aria-label={t.scansionaTitolo} onClose={ferma}>
        <div className="tessera-overlay__bar">
          <p className="t-eyebrow">{t.scansionaTitolo}</p>
          <button type="button" className="icon-btn" aria-label={t.chiudi} onClick={chiudi}>
            <IconChiudi />
          </button>
        </div>
        {stato === "errore" ? (
          <p className="notice notice--errore scansiona-testo" role="alert">{errore}</p>
        ) : (
          <>
            <div className="scansiona-riquadro">
              <video ref={video} className="scansiona-video" muted playsInline aria-hidden="true" />
            </div>
            <p className="t-body-l scansiona-testo" aria-live="polite">
              {stato === "avvio" ? t.avvio : t.inquadra}
            </p>
          </>
        )}
        <button type="button" className="psc-btn psc-btn--ghost" onClick={chiudi}>{t.aMano}</button>
      </dialog>
    </div>
  );
}
