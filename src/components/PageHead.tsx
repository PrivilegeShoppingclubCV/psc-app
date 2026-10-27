export function PageHead({ eyebrow, titolo, children }: { eyebrow?: string; titolo: string; children?: React.ReactNode }) {
  return (
    <div className="page-head">
      {eyebrow && <p className="t-eyebrow">{eyebrow}</p>}
      <h1 className="t-display-l">{titolo}</h1>
      {children}
    </div>
  );
}
