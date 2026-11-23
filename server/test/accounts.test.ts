import test from "node:test";
import assert from "node:assert/strict";
import { initialVerificationStatus } from "../src/verification/accounts.ts";

test("all public account roles are approved automatically", () => {
  assert.equal(initialVerificationStatus("client"), "verified");
  assert.equal(initialVerificationStatus("company"), "verified");
  assert.equal(initialVerificationStatus("professional"), "verified");
});
