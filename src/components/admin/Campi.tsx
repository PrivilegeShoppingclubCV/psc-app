// Campi dei moduli del pannello, sulle classi .psc-field del design system.

type Base = { id: string; label: string; help?: string };

export function Campo({ id, label, help, ...input }: Base & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="psc-field">
      <label className="psc-field__label" htmlFor={id}>{label}</label>
      <input id={id} name={id} className="psc-field__input" aria-describedby={help ? `${id}-help` : undefined} {...input} />
      {help && <span id={`${id}-help`} className="psc-field__help">{help}</span>}
    </div>
  );
}

export function Area({ id, label, help, ...input }: Base & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className="psc-field admin-field--wide">
      <label className="psc-field__label" htmlFor={id}>{label}</label>
      <textarea id={id} name={id} className="psc-field__input admin-textarea" aria-describedby={help ? `${id}-help` : undefined} {...input} />
      {help && <span id={`${id}-help`} className="psc-field__help">{help}</span>}
    </div>
  );
}

export function Scelta({ id, label, help, opzioni, ...select }: Base & {
  opzioni: { value: string; label: string }[];
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="psc-field">
      <label className="psc-field__label" htmlFor={id}>{label}</label>
      <select id={id} name={id} className="psc-field__input" aria-describedby={help ? `${id}-help` : undefined} {...select}>
        {opzioni.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {help && <span id={`${id}-help`} className="psc-field__help">{help}</span>}
    </div>
  );
}

export function Interruttore({ id, label, help, ...input }: Base & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="spunta admin-spunta" htmlFor={id}>
      <input id={id} name={id} type="checkbox" {...input} />
      <span>
        {label}
        {help && <span className="t-caption admin-spunta__help">{help}</span>}
      </span>
    </label>
  );
}
