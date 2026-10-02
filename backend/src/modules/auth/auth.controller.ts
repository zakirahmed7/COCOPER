/**
 * @file auth.controller.ts
 * @description Controller for application authentication.
 */

import type { NextFunction, Request, Response } from 'express';
import { loginService } from './auth.service.js';
import { readAuthToken } from './auth.token.js';
import { revokeAuthSession } from './auth.session.js';

export async function loginHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const result = await loginService(req.body);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      user: result.user,
      token: result.token,
      tokenId: result.tokenId,
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    return next(error);
  }
}

export async function logoutHandler(req: Request, res: Response, next: NextFunction) {
  const authorization = req.header('authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const claims = token ? readAuthToken(token) : null;
  try {
    if (claims) {
      await revokeAuthSession(claims.jti);
      console.info('auth.logout', { userId: claims.sub, username: claims.username, tokenId: claims.jti });
    }
    return res.status(200).json({ success: true, message: 'Logout successful' });
  } catch (error) {
    return next(error);
  }
}
