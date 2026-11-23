WITH promoted AS (
  UPDATE users
     SET verification_status = 'verified', updated_at = now()
   WHERE role IN ('client', 'company', 'professional') AND verification_status = 'pending'
  RETURNING id
), reviewed_requests AS (
  UPDATE verification_requests
     SET status = 'verified', reviewed_at = now(), reviewed_by = NULL,
         review_reason = 'Aprobación automática temporal de cuentas.'
   -- Las sentencias de un WITH no ven los cambios de sus hermanas: se incluye a los recién promovidos por su id.
   WHERE status = 'pending' AND (
     user_id IN (SELECT id FROM promoted) OR EXISTS (
       SELECT 1 FROM users u
        WHERE u.id = verification_requests.user_id
          AND u.role IN ('client', 'company', 'professional')
          AND u.verification_status = 'verified'
     )
   )
  RETURNING user_id
)
INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason)
SELECT NULL, 'verification.account_auto_approved', 'user', id,
       'Migración automática temporal de cuenta pendiente.'
  FROM promoted;
