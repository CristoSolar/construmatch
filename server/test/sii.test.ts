import test from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decide, lookupSii, normalizeName, parseRut, rutDv } from "../src/verification/sii.ts";

const ACTIVE = { legalName: "CONSTRUCTORA ANDES LIMITADA", startDate: "01-01-2015", terminatedOn: "" };

test("RUT: dígito verificador módulo 11, incluidos K y 0", () => {
  assert.equal(rutDv("76107191"), "2");
  assert.equal(rutDv("78164014"), "K");
  assert.equal(rutDv("76601309"), "0");
});

test("RUT: acepta puntos, guion, espacios y k minúscula; rechaza texto que no es RUT", () => {
  assert.deepEqual(parseRut("76.107.191-2"), { number: "76107191", dv: "2" });
  assert.deepEqual(parseRut("RUT 78164014-k"), { number: "78164014", dv: "K" });
  assert.deepEqual(parseRut("761071912"), { number: "76107191", dv: "2" });
  assert.equal(parseRut("Escritura N° 123"), null);
});

test("razón social: ignora tildes, puntuación y forma jurídica abreviada o completa", () => {
  assert.equal(normalizeName("Constructora Ñuñoa Ltda."), normalizeName("CONSTRUCTORA NUNOA LIMITADA"));
  assert.equal(normalizeName("Obras Sur S.p.A."), "OBRAS SUR SPA");
  assert.equal(normalizeName("Obras Sur Sociedad por Acciones"), "OBRAS SUR SPA");
});

test("aprueba solo RUT válido, vigente y con razón social coincidente", () => {
  const ok = decide({ documentReference: "76.107.191-2", legalName: "Constructora Andes Ltda." }, ACTIVE, false);
  assert.equal(ok.status, "verified");
  const otherForm = decide({ documentReference: "76107191-2", legalName: "Constructora Andes SpA" }, ACTIVE, false);
  assert.equal(otherForm.status, "verified", "misma razón social con otra forma jurídica");
});

test("rechaza dígito verificador inválido y empresas con término de giro", () => {
  assert.equal(decide({ documentReference: "76107191-3", legalName: "X" }, ACTIVE, false).status, "rejected");
  const closed = decide({ documentReference: "76107191-2", legalName: "Constructora Andes Ltda" }, { ...ACTIVE, terminatedOn: "31-12-2024" }, false);
  assert.equal(closed.status, "rejected");
  assert.match(closed.reason, /término de giro/);
});

test("deja a revisión manual lo dudoso: no es RUT, no está en la nómina, nombre distinto o RUT ya usado", () => {
  assert.equal(decide({ documentReference: "Pasaporte AB123", legalName: "X" }, undefined, false).status, "manual");
  assert.equal(decide({ documentReference: "76107191-2", legalName: "X" }, undefined, false).status, "manual");
  assert.equal(decide({ documentReference: "76107191-2", legalName: "Inmobiliaria Pacífico" }, ACTIVE, false).status, "manual");
  assert.equal(decide({ documentReference: "76107191-2", legalName: "Constructora Andes Ltda" }, ACTIVE, true).status, "manual");
});

test("lookupSii lee el TSV del SII y devuelve solo los RUT pedidos", async () => {
  const file = join(tmpdir(), `sii-${process.pid}.txt`);
  await writeFile(file, [
    "RUT\tDV\tCOD_SUBTIPO\tRAZON_SOCIAL\tFECHA_INICIO_VIG\tFECHA_TG_VIG",
    "76107191\t2\t223\tSII GROUP CHILE SPA\t05-08-2010\t",
    "78164014\tK\t211\tSII CONTABLE LIMITADA\t14-05-2025\t01-06-2026",
    "50009350\t1\t211\tMENESES ARQUITECTOS ASOCIADOS LIMITADA\t01-01-1993\t",
  ].join("\r\n"));
  const found = await lookupSii(file, new Set(["76107191", "78164014"]));
  assert.deepEqual([...found.keys()].sort(), ["76107191", "78164014"]);
  assert.deepEqual(found.get("78164014"), { legalName: "SII CONTABLE LIMITADA", startDate: "14-05-2025", terminatedOn: "01-06-2026" });
  assert.equal(found.get("76107191")!.terminatedOn, "");
});
