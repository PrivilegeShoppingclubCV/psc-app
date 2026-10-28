"use client";

/** Bottone di invio che chiede conferma prima di un'operazione che non si annulla. */
export function Conferma({ messaggio, className = "psc-btn psc-btn--secondary admin-btn--danger", children, ...props }: {
  messaggio: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => { if (!window.confirm(messaggio)) e.preventDefault(); }}
      {...props}
    >
      {children}
    </button>
  );
}
