import type { Lingua } from "../../lingue";
import { club as ar } from "./ar";
import { club as de } from "./de";
import { club as en } from "./en";
import { club as es } from "./es";
import { club as fr } from "./fr";
import { club as it, type TestiClub } from "./it";
import { club as pl } from "./pl";
import { club as pt } from "./pt";
import { club as ro } from "./ro";
import { club as ru } from "./ru";
import { club as zh } from "./zh";

export const TESTI_CLUB: Record<Lingua, TestiClub> = { it, en, fr, de, es, pt, ro, pl, ru, zh, ar };
export type { TestiClub } from "./it";
