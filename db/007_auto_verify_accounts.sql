WITH promoted AS (
  UPDATE users
     SET verification_status = 'verified', updated_at = now()
   WHERE role IN ('client', 'company', 'professional') AND verification_status = 'pending'
  RETURNING id
), reviewed_requests AS (
  UPDATE verification_requests
     SET status = 'verified', reviewed_at = now(), reviewed_by = NULL,
         review_reason = 'Aprobación automática temporal de cuentas.'
   WHERE status = 'pending' AND EXISTS (
     SELECT 1 FROM users u
      WHERE u.id = verification_requests.user_id
        AND u.role IN ('client', 'company', 'professional')
        AND u.verification_status = 'verified'
   )
  RETURNING user_id
)
INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason)
SELECT NULL, 'verification.account_auto_approved', 'user', id,
       'Migración automática temporal de cuenta pendiente.'
  FROM promoted;
