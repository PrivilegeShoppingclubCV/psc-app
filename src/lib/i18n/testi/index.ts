import type { Lingua } from "../lingue";
import { ar } from "./ar";
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
export type { Testi, TestiClient } from "./it";
