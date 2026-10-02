import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { APP_CONFIG } from '../../config/env.js';
import { isAuthSessionActive } from './auth.session.js';

const TOKEN_TTL_SECONDS = 8 * 60 * 60;

export interface AuthTokenClaims {
  sub: string;
  username: string;
  role: string;
  isSuperAdmin: boolean;
  organizationId: string | null;
  permissions: string[];
  jti: string;
  iat: number;
  exp: number;
}

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function sign(input: string): string {
  if (!APP_CONFIG.JWT_SECRET) throw new Error('JWT_SECRET is not configured');
  return createHmac('sha256', APP_CONFIG.JWT_SECRET).update(input).digest('base64url');
}

export function generateAuthToken(user: {
  id: string;
  username: string;
  role: string;
  isSuperAdmin: boolean;
  organizationId: string | null;
  permissions?: string[];
}): AuthTokenClaims & { token: string } {
  const iat = Math.floor(Date.now() / 1000);
  const claims: AuthTokenClaims = {
    sub: user.id,
    username: user.username,
    role: user.role,
    isSuperAdmin: user.isSuperAdmin,
    organizationId: user.organizationId,
    permissions: user.permissions ?? [],
    jti: randomUUID(),
    iat,
    exp: iat + TOKEN_TTL_SECONDS,
  };
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode(claims);
  const input = `${header}.${payload}`;
  return { ...claims, token: `${input}.${sign(input)}` };
}

export function readAuthToken(token: string): AuthTokenClaims | null {
  try {
    const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
    if (!encodedHeader || !encodedPayload || !encodedSignature) return null;
    const expected = Buffer.from(sign(`${encodedHeader}.${encodedPayload}`));
    const actual = Buffer.from(encodedSignature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const claims = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as AuthTokenClaims;
    return claims.sub && claims.jti && claims.exp > Math.floor(Date.now() / 1000) ? claims : null;
  } catch {
    return null;
  }
}

export async function verifyAuthToken(token: string): Promise<AuthTokenClaims | null> {
  const claims = readAuthToken(token);
  if (!claims || !(await isAuthSessionActive(claims.jti))) return null;
  return claims;
}