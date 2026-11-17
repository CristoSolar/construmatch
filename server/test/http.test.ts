import test from "node:test";
import assert from "node:assert/strict";
import { allowOnlyFields, HttpError, sendError, uuid } from "../src/http.ts";

test("rejects malformed identifiers before they reach PostgreSQL", () => {
  assert.throws(() => uuid("not-a-uuid"), (error: unknown) => error instanceof HttpError && error.status === 400 && error.code === "invalid_id");
  assert.equal(uuid("550e8400-e29b-41d4-a716-446655440000"), "550e8400-e29b-41d4-a716-446655440000");
});

test("maps expected parser and database failures without returning 500", () => {
  const calls: Array<{ status: number; body: unknown }> = [];
  const response = {
    currentStatus: 200,
    status(status: number) { this.currentStatus = status; return this; },
    json(body: unknown) { calls.push({ status: this.currentStatus, body }); return this; },
  };
  sendError(response as any, { status: 400, type: "entity.parse.failed" });
  sendError(response as any, { code: "23505" });
  assert.equal(calls[0].status, 400);
  assert.equal(calls[1].status, 409);
});

test("rejects unexpected attributes instead of mass assigning them", () => {
  assert.doesNotThrow(() => allowOnlyFields({ title: "Obra" }, ["title"]));
  assert.throws(
    () => allowOnlyFields({ title: "Obra", role: "admin" }, ["title"]),
    (error: unknown) => error instanceof HttpError && error.status === 400 && error.code === "unexpected_field",
  );
});
