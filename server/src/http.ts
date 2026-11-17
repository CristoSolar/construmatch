import type { Response } from "express";

export class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code = "request_error") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function sendError(response: Response, error: unknown): void {
  if (error instanceof HttpError) {
    response.status(error.status).json({ error: error.code, message: error.message });
    return;
  }
  const databaseCode = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  if (databaseCode === "23505") {
    response.status(409).json({ error: "conflict", message: "La operación entra en conflicto con un registro existente." });
    return;
  }
  if (["22P02", "23502", "23503", "23514"].includes(databaseCode)) {
    response.status(400).json({ error: "invalid_data", message: "Los datos enviados no son válidos." });
    return;
  }
  const parserStatus = typeof error === "object" && error !== null && "status" in error
    ? Number((error as { status?: unknown }).status)
    : 0;
  if (parserStatus === 400) {
    response.status(400).json({ error: "invalid_json", message: "El cuerpo de la solicitud no contiene JSON válido." });
    return;
  }
  if (parserStatus === 413) {
    response.status(413).json({ error: "payload_too_large", message: "La solicitud supera el tamaño permitido." });
    return;
  }
  console.error(error);
  response.status(500).json({ error: "internal_error", message: "No fue posible completar la solicitud." });
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function uuid(value: unknown, notFound = false): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    throw new HttpError(notFound ? 404 : 400, notFound ? "Recurso no encontrado." : "Identificador inválido.", notFound ? "not_found" : "invalid_id");
  }
  return value;
}

export function allowOnlyFields(value: unknown, allowed: readonly string[]): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "Datos inválidos.", "invalid_body");
  const allowedSet = new Set(allowed);
  if (Object.keys(value).some(key => !allowedSet.has(key))) {
    throw new HttpError(400, "La solicitud contiene campos no permitidos.", "unexpected_field");
  }
}

export function text(value: unknown, maxLength: number): string {
  if (typeof value !== "string") throw new HttpError(400, "Datos inválidos.");
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) throw new HttpError(400, "Datos inválidos.");
  return normalized;
}

export function positiveMoney(value: unknown): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new HttpError(400, "Monto inválido.");
  return amount;
}
