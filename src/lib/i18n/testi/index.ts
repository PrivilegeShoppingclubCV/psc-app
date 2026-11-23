import type { Lingua } from "../lingue";
import { ar } from "./ar";
import { TESTI_CLUB } from "./club";
import type { TestiClub } from "./club/it";
import { de } from "./de";
import { en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { it, type Testi } from "./it";
import { pl } from "./pl";
import { pt } from "./pt";
import { ro } from "./ro";
import { ru } from "./ru";
import { zh } from "./zh";

export const TESTI: Record<Lingua, Testi> = { it, en, fr, de, es, pt, ro, pl, ru, zh, ar };
export { TESTI_CLUB };
export type { Testi, TestiClub };

/** Tutti i testi dei componenti che girano nel browser, in una lingua. */
export type TestiClient = Testi["client"] & TestiClub["client"];
export const testiClient = (l: Lingua): TestiClient => ({ ...TESTI[l].client, ...TESTI_CLUB[l].client });
