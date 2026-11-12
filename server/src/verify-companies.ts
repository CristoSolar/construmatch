// Valida automáticamente las solicitudes pendientes de empresas contra la nómina del SII.
// Uso: npm run verify:companies -- --file PUB_NOMBRES_PJ.zip [--apply]
// Sin --apply solo muestra el informe. Con --apply aprueba/rechaza lo seguro; lo dudoso queda pendiente
// para que lo revise un administrador.
import { parseArgs } from "node:util";
import { pool, withTransaction } from "./db.ts";
import { decide, lookupSii, parseRut } from "./verification/sii.ts";

const { values } = parseArgs({ options: { file: { type: "string" }, apply: { type: "boolean", default: false } } });
if (!values.file) {
  console.error("Falta --file con la ruta a PUB_NOMBRES_PJ.zip o PUB_NOMBRES_PJ.txt (https://www.sii.cl/sobre_el_sii/nominapersonasjuridicas.html).");
  process.exit(1);
}

const pending = await pool.query(
  `SELECT vr.user_id, vr.legal_name, vr.document_reference, u.email
     FROM verification_requests vr JOIN users u ON u.id = vr.user_id
    WHERE vr.status = 'pending' AND u.role = 'company'
    ORDER BY vr.submitted_at`,
);
const verified = await pool.query(
  `SELECT vr.user_id, vr.document_reference FROM verification_requests vr WHERE vr.status = 'verified'`,
);
const verifiedRuts = new Map<string, string>();
for (const row of verified.rows) {
  const rut = parseRut(row.document_reference);
  if (rut) verifiedRuts.set(rut.number, row.user_id);
}

const wanted = new Set(pending.rows.map(row => parseRut(row.document_reference)?.number).filter((n): n is string => !!n));
const sii = await lookupSii(values.file, wanted);

const counts = { verified: 0, rejected: 0, manual: 0 };
for (const row of pending.rows) {
  const rut = parseRut(row.document_reference);
  const owner = rut && verifiedRuts.get(rut.number);
  const decision = decide(
    { documentReference: row.document_reference, legalName: row.legal_name },
    rut ? sii.get(rut.number) : undefined,
    !!owner && owner !== row.user_id,
  );
  counts[decision.status]++;
  // Dos cuentas pendientes con el mismo RUT: solo la primera se aprueba sola.
  if (decision.status === "verified") verifiedRuts.set(rut!.number, row.user_id);
  console.log(`${decision.status.padEnd(8)} ${row.email}  [${row.document_reference} · ${row.legal_name}]  ${decision.reason}`);
  if (!values.apply || decision.status === "manual") continue;

  const reason = `Validación automática SII: ${decision.reason}`;
  await withTransaction(async client => {
    const updated = await client.query(
      `UPDATE verification_requests SET status = $1, reviewed_at = now(), reviewed_by = NULL, review_reason = $2
        WHERE user_id = $3 AND status = 'pending'`,
      [decision.status, reason, row.user_id],
    );
    if (!updated.rowCount) return; // la revisó un admin mientras corría el script
    // No se toca una cuenta suspendida.
    await client.query(`UPDATE users SET verification_status = $1, updated_at = now() WHERE id = $2 AND verification_status <> 'suspended'`, [decision.status, row.user_id]);
    await client.query(
      `INSERT INTO audit_log(actor_user_id, action, target_type, target_id, reason) VALUES (NULL, $1, 'user', $2, $3)`,
      [`verification.${decision.status}`, row.user_id, reason],
    );
  });
}

console.log(`\n${pending.rowCount} pendientes · ${counts.verified} aprobadas · ${counts.rejected} rechazadas · ${counts.manual} a revisión manual${values.apply ? "" : " (simulación: usa --apply para guardar)"}`);
await pool.end();
