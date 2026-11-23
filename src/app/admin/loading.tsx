// Mentre la pagina si carica: il menu resta dov'è e al posto del contenuto
// compare subito un segnaposto, così il clic si vede anche se i dati arrivano dopo.
export default function Caricamento() {
  return (
    <div className="admin-caricamento" role="status" aria-live="polite">
      <span className="sr-only">Caricamento…</span>
      <div className="admin-caricamento__titolo" />
      <div className="admin-caricamento__riga" />
      <div className="admin-caricamento__riga" />
      <div className="admin-caricamento__riga" />
      <div className="admin-caricamento__riga admin-caricamento__riga--corta" />
    </div>
  );
}
