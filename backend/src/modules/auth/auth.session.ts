import { pool } from '../../config/db.js';

export async function createAuthSession(
  tokenId: string,
  userId: string,
  expiresAt: number,
): Promise<void> {
  await pool.query('DELETE FROM auth_sessions WHERE expires_at <= CURRENT_TIMESTAMP');
  await pool.query(
    `INSERT INTO auth_sessions (token_id, user_id, expires_at)
     VALUES ($1, $2, TO_TIMESTAMP($3))`,
    [tokenId, userId, expiresAt],
  );
}

export async function revokeAuthSession(tokenId: string): Promise<void> {
  await pool.query('DELETE FROM auth_sessions WHERE token_id = $1', [tokenId]);
}

export async function isAuthSessionActive(tokenId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM auth_sessions
     WHERE token_id = $1 AND expires_at > CURRENT_TIMESTAMP
     LIMIT 1`,
    [tokenId],
  );
  return (rowCount ?? 0) > 0;
}