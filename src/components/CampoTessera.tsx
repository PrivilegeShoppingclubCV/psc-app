"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconChiudi, IconFotocamera } from "./Icons";

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

/** Campo "numero tessera" con il bottone per leggere il codice a barre con la fotocamera. */
export function CampoTessera({ id, label, help, ...input }: { id: string; label: string; help?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const campo = useRef<HTMLInputElement>(null);
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
              if (campo.current) campo.current.value = numero;
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
          ? "Non abbiamo il permesso di usare la fotocamera. Puoi darlo dalle impostazioni del browser, oppure scrivere il numero a mano."
          : nome === "NotFoundError" || nome === "OverconstrainedError"
            ? "Non troviamo una fotocamera su questo dispositivo. Scrivi il numero a mano."
            : "Non riusciamo ad aprire la fotocamera. Scrivi il numero a mano.",
      );
      ferma();
    }
  };

  return (
    <div className="psc-field">
      <label className="psc-field__label" htmlFor={id}>{label}</label>
      <input ref={campo} id={id} name={id} className="psc-field__input" aria-describedby={help ? `${id}-help` : undefined} {...input} />
      {help && <span id={`${id}-help`} className="psc-field__help">{help}</span>}
      {puoScansionare && (
        <button type="button" className="psc-btn psc-btn--secondary scansiona-btn" onClick={apri}>
          <IconFotocamera />
          Scansiona con la fotocamera
        </button>
      )}

      <dialog ref={dialog} className="tessera-overlay" aria-label="Scansiona la tessera" onClose={ferma}>
        <div className="tessera-overlay__bar">
          <p className="t-eyebrow">Scansiona la tessera</p>
          <button type="button" className="icon-btn" aria-label="Chiudi" onClick={chiudi}>
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
              {stato === "avvio" ? "Apro la fotocamera…" : "Inquadra il codice a barre sul retro della tessera, dentro il riquadro."}
            </p>
          </>
        )}
        <button type="button" className="psc-btn psc-btn--ghost" onClick={chiudi}>Scrivo il numero a mano</button>
      </dialog>
    </div>
  );
}
