// Validación automática de empresas contra la Nómina de Personas Jurídicas del SII.
// Fuente: https://www.sii.cl/sobre_el_sii/nominapersonasjuridicas.html (PUB_NOMBRES_PJ.zip, TSV UTF-8:
// RUT, DV, COD_SUBTIPO, RAZON_SOCIAL, FECHA_INICIO_VIG, FECHA_TG_VIG). Pública y sin captcha, pero se
// actualiza ~1 vez al año y solo incluye personas jurídicas.
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

export type Rut = { number: string; dv: string };
export type SiiEntry = { legalName: string; startDate: string; terminatedOn: string };
export type Decision = { status: "verified" | "rejected" | "manual"; reason: string };

/** Dígito verificador por módulo 11. */
export function rutDv(number: string): string {
  let sum = 0;
  let factor = 2;
  for (let i = number.length - 1; i >= 0; i--) {
    sum += Number(number[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const dv = 11 - (sum % 11);
  return dv === 11 ? "0" : dv === 10 ? "K" : String(dv);
}

/** Extrae un RUT ("76.107.191-2", "76107191-2", "761071912") del texto ingresado; null si no parece RUT. */
export function parseRut(input: string): Rut | null {
  const match = /(\d{1,2}\.?\d{3}\.?\d{3})\s*-?\s*([\dkK])\b/.exec(input);
  if (!match) return null;
  return { number: match[1].replace(/\./g, "").replace(/^0+/, ""), dv: match[2].toUpperCase() };
}

const SUFFIXES: [RegExp, string][] = [
  [/\bSOCIEDAD POR ACCIONES\b/g, "SPA"],
  [/\bSOCIEDAD ANONIMA\b/g, "SA"],
  [/\bLIMITADA\b/g, "LTDA"],
  [/\bEMPRESA INDIVIDUAL DE RESPONSABILIDAD LIMITADA\b/g, "EIRL"],
  [/\bCOMPANIA\b/g, "CIA"],
  [/\bS A\b/g, "SA"],
  [/\bS P A\b/g, "SPA"],
  [/\bE I R L\b/g, "EIRL"],
];
const LEGAL_FORMS = /\b(LTDA|SPA|SA|EIRL|CIA|Y CIA)\b/g;

/** Razón social comparable: mayúsculas, sin tildes ni puntuación, con formas jurídicas abreviadas. */
export function normalizeName(name: string): string {
  let n = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  for (const [pattern, short] of SUFFIXES) n = n.replace(pattern, short);
  return n.replace(/\s+/g, " ").trim();
}

const core = (name: string) => name.replace(LEGAL_FORMS, " ").replace(/\s+/g, " ").trim();

/**
 * Regla de decisión. Solo se aprueba con certeza (RUT válido, vigente y razón social coincidente);
 * se rechaza lo inequívoco (dígito verificador malo, término de giro); el resto queda para revisión manual.
 */
export function decide(input: { documentReference: string; legalName: string }, entry: SiiEntry | undefined, rutTakenByOther: boolean): Decision {
  const rut = parseRut(input.documentReference);
  if (!rut) return { status: "manual", reason: "La referencia ingresada no es un RUT." };
  if (rutDv(rut.number) !== rut.dv) return { status: "rejected", reason: `El RUT ${rut.number}-${rut.dv} tiene un dígito verificador inválido.` };
  if (rutTakenByOther) return { status: "manual", reason: `El RUT ${rut.number}-${rut.dv} ya está validado en otra cuenta.` };
  if (!entry) return { status: "manual", reason: "El RUT no figura en la nómina de personas jurídicas del SII (persona natural o empresa más nueva que la nómina)." };
  if (entry.terminatedOn) return { status: "rejected", reason: `Según el SII, la empresa tiene término de giro desde ${entry.terminatedOn}.` };
  const given = normalizeName(input.legalName);
  const official = normalizeName(entry.legalName);
  if (given === official || (core(given) !== "" && core(given) === core(official)))
    return { status: "verified", reason: `RUT vigente y razón social coincide con el SII: ${entry.legalName}.` };
  return { status: "manual", reason: `La razón social no coincide con el SII ("${entry.legalName}").` };
}

/** Busca en la nómina (.txt o .zip) solo los RUT pedidos, leyendo el archivo como stream. */
export async function lookupSii(file: string, ruts: Set<string>): Promise<Map<string, SiiEntry>> {
  const found = new Map<string, SiiEntry>();
  // ponytail: el .zip se lee con `unzip -p` del sistema; Node no trae lector de zip.
  const input = file.endsWith(".zip") ? spawn("unzip", ["-p", file, "PUB_NOMBRES_PJ.txt"]).stdout : createReadStream(file);
  for await (const line of createInterface({ input, crlfDelay: Infinity })) {
    const tab = line.indexOf("\t");
    const number = line.slice(0, tab);
    if (!ruts.has(number)) continue;
    const [, , , legalName, startDate, terminatedOn = ""] = line.split("\t");
    found.set(number, { legalName, startDate, terminatedOn: terminatedOn.trim() });
  }
  return found;
}
