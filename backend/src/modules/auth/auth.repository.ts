/**
 * @file auth.repository.ts
 * @description Repository for application authentication.
 */

import { pool } from '../../config/db.js';
import type { AuthUserResult } from './auth.types.js';

export const MOBILE_LOGIN_PERMISSION = 'mobile-app.login';
export const MOBILE_LABOUR_ATTENDANCE_PERMISSION = 'mobile-app.labour-attendance';

interface SuperUserRow {
  id: string;
  username: string;
  password_hash: string;
  full_name: string | null;
  role: string;
  status: string;
}

export async function findSuperUserByUsername(username: string): Promise<SuperUserRow | null> {
  const { rows } = await pool.query(
    `
    SELECT id, username, password_hash, full_name, role, status
    FROM app_users
    WHERE LOWER(username) = LOWER($1) AND LOWER(status) = 'active'
    LIMIT 1
    `,
    [username]
  );
  return rows[0] ?? null;
}

interface OrgUserRow {
  id: string;
  username: string;
  password_hash: string;
  full_name: string | null;
  role: string;
  status: string;
  organization_id: string;
}

export async function findOrgUserByEmail(email: string): Promise<OrgUserRow | null> {
  const { rows } = await pool.query(
    `
    SELECT
      ou.id,
      ou.username,
      ou.password_hash,
      ou.full_name,
      ou.role,
      ou.status,
      ou.organization_id
    FROM organization_users ou
    WHERE LOWER(ou.email) = LOWER($1) AND LOWER(ou.status) = 'active'
    LIMIT 1
    `,
    [email]
  );
  return rows[0] ?? null;
}

export async function updateSuperUserLastLogin(id: string): Promise<void> {
  await pool.query(
    `UPDATE app_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [id]
  );
}

export async function updateOrgUserLastLogin(id: string): Promise<void> {
  await pool.query(
    `UPDATE organization_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [id]
  );
}

export async function hasMobileLoginPermission(userId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `
    SELECT 1
    FROM user_permissions
    WHERE user_id = $1
      AND permission_code IN ($2, $3)
    LIMIT 1
    `,
    [userId, MOBILE_LOGIN_PERMISSION, MOBILE_LABOUR_ATTENDANCE_PERMISSION]
  );
  return (rowCount ?? 0) > 0;
}

export async function listUserPermissions(userId: string): Promise<string[]> {
  const { rows } = await pool.query<{ permission_code: string }>(
    `SELECT permission_code
     FROM user_permissions
     WHERE user_id = $1
     ORDER BY permission_code`,
    [userId],
  );
  return rows.map((row) => row.permission_code);
}

export function toAuthUserResult(
  id: string,
  username: string,
  fullName: string | null,
  role: string,
  isSuperAdmin: boolean,
  organizationId: string | null
): AuthUserResult {
  return {
    id,
    username,
    full_name: fullName,
    role,
    is_super_admin: isSuperAdmin,
    organization_id: organizationId,
  };
}
