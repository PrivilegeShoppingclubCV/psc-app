// Icone a tratto (24×24, stroke currentColor), coerenti con la barra del design system.
type P = React.SVGProps<SVGSVGElement>;

const base = (props: P) => ({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...props,
});

export const IconNegozi = (p: P) => (
  <svg {...base(p)}><path d="M4 9.5 5.2 4h13.6L20 9.5" /><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0" /><path d="M5 11.5V20h14v-8.5" /><path d="M10 20v-5h4v5" /></svg>
);
export const IconPunti = (p: P) => (
  <svg {...base(p)}><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" /></svg>
);
export const IconHome = (p: P) => (
  <svg {...base(p)}><path d="M4 10.5 12 4l8 6.5V20h-5v-5.5h-6V20H4z" /></svg>
);
export const IconOfferte = (p: P) => (
  <svg {...base(p)}><path d="M3.5 12.6V4.5a1 1 0 0 1 1-1h8.1l8 8a1.4 1.4 0 0 1 0 2l-7.1 7.1a1.4 1.4 0 0 1-2 0z" /><circle cx="8" cy="8" r="1.4" /></svg>
);
export const IconProfilo = (p: P) => (
  <svg {...base(p)}><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20c.8-3.8 3.8-6 7.5-6s6.7 2.2 7.5 6" /></svg>
);
export const IconTessera = (p: P) => (
  <svg {...base(p)}><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="M7 10v4M9.5 10v4M12 10v4M15 10v4M17 10v4" /></svg>
);
export const IconChiudi = (p: P) => (
  <svg {...base(p)}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const IconIndietro = (p: P) => (
  <svg {...base(p)}><path d="M15 5l-7 7 7 7" /></svg>
);
export const IconInstalla = (p: P) => (
  <svg {...base(p)}><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" /><path d="M5 19.5h14" /></svg>
);
