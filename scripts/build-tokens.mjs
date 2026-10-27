// Genera src/styles/tokens.css da src/styles/tokens.json (copia del design system).
// Uso: npm run tokens
import { readFileSync, writeFileSync } from "node:fs";

const src = new URL("../src/styles/tokens.json", import.meta.url);
const out = new URL("../src/styles/tokens.css", import.meta.url);
const t = JSON.parse(readFileSync(src, "utf8"));

const light = [];
const dark = [];
const ref = (v) => (typeof v === "string" ? v.replace(/\{([\w-]+)\}/g, "var(--$1)") : v);

const groups = [t.color.tokens, t.spacing.tokens, t.radius.tokens, t.shadow.tokens];
for (const tokens of groups) {
  for (const { name, value } of tokens) {
    if (typeof value === "object") {
      light.push(`  --${name}: ${ref(value.light)};`);
      dark.push(`  --${name}: ${ref(value.dark)};`);
    } else {
      light.push(`  --${name}: ${ref(value)};`);
    }
  }
}

const css = `/* Generato da scripts/build-tokens.mjs — non modificare a mano. */
:root {
${light.join("\n")}
  color-scheme: light;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${dark.map((l) => "  " + l).join("\n")}
    color-scheme: dark;
  }
}

:root[data-theme="dark"] {
${dark.join("\n")}
  color-scheme: dark;
}
`;
writeFileSync(out, css);
console.log("tokens.css scritto");
