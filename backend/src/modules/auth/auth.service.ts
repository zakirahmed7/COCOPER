/**
 * @file auth.service.ts
 * @description Business logic for application authentication.
 */

import bcrypt from 'bcryptjs';
import { AppError } from '../../utils/AppError.js';
import type { LoginPayload, LoginResult } from './auth.types.js';
import { generateAuthToken } from './auth.token.js';
import { createAuthSession } from './auth.session.js';
import {
  findOrgUserByEmail,
  hasMobileLoginPermission,
  listUserPermissions,
  findSuperUserByUsername,
  toAuthUserResult,
  updateOrgUserLastLogin,
  updateSuperUserLastLogin,
} from './auth.repository.js';

export async function loginService(payload: LoginPayload): Promise<LoginResult> {
  const email = String(payload.email ?? '').trim().toLowerCase();
  const password = String(payload.password ?? '');

  if (!email || !password) {
    throw new AppError('Email and password are required', 400);
  }

  // Super admins continue to use their existing username credentials.
  const superUser = await findSuperUserByUsername(email);

  if (superUser) {
    const valid = await bcrypt.compare(password, superUser.password_hash);

    if (valid) {
      await updateSuperUserLastLogin(superUser.id);

      const user = toAuthUserResult(
          superUser.id,
          superUser.username,
          superUser.full_name,
          superUser.role,
          true,
          null
        );
      const token = generateAuthToken({ id: user.id, username: user.username, role: user.role, isSuperAdmin: user.is_super_admin, organizationId: user.organization_id });
      await createAuthSession(token.jti, user.id, token.exp);
      console.info('auth.login', { userId: user.id, username: user.username, tokenId: token.jti });
      return { user, token: token.token, tokenId: token.jti, expiresAt: token.exp };
    }

    throw new AppError('Invalid username or password', 401);
  }

  // 2) Check organization user.
  const orgUser = await findOrgUserByEmail(email);

  if (orgUser) {
    const valid = await bcrypt.compare(password, orgUser.password_hash);

    if (valid) {
      if (payload.client === 'mobile') {
        const canLoginToMobileApp = await hasMobileLoginPermission(orgUser.id);
        if (!canLoginToMobileApp) {
          throw new AppError('Mobile app access is not enabled for this user.', 403);
        }
      }

      await updateOrgUserLastLogin(orgUser.id);

      const user = toAuthUserResult(
          orgUser.id,
          orgUser.username,
          orgUser.full_name,
          orgUser.role,
          false,
          orgUser.organization_id
        );
      const permissions = await listUserPermissions(user.id);
      const token = generateAuthToken({ id: user.id, username: user.username, role: user.role, isSuperAdmin: user.is_super_admin, organizationId: user.organization_id, permissions });
      await createAuthSession(token.jti, user.id, token.exp);
      console.info('auth.login', { userId: user.id, username: user.username, tokenId: token.jti });
      return { user, token: token.token, tokenId: token.jti, expiresAt: token.exp };
    }
  }

  throw new AppError('Invalid username or password', 401);
}
