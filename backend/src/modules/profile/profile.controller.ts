/**
 * @file profile.controller.ts
 * @description Controller for the current-user profile module.
 */

import type { NextFunction, Request, Response } from 'express';
import {
  changePassword as changePasswordService,
  getProfile as getProfileService,
  updateProfile as updateProfileService,
} from './profile.service.js';
import { AppError } from '../../utils/AppError.js';
import { verifyAuthToken } from '../auth/auth.token.js';

async function resolveIdentity(req: Request): Promise<{ userId: string; userType: 'super' | 'org' }> {
  const authorization = req.header('authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const claims = token ? await verifyAuthToken(token) : null;

  if (claims) {
    return {
      userId: claims.sub,
      userType: claims.isSuperAdmin ? 'super' : 'org',
    };
  }

  throw new AppError('A valid Bearer token is required', 401);
}

export async function getProfileHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { userId, userType } = await resolveIdentity(req);
    const profile = await getProfileService(userId, userType);

    if (!profile) return next(new AppError('Profile not found', 404));

    return res.status(200).json(profile);
  } catch (error) {
    if (error instanceof AppError) return next(error);
    return next(new AppError('Failed to load profile', 500, { cause: error }));
  }
}

export async function updateProfileHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { userId, userType } = await resolveIdentity(req);
    const profile = await updateProfileService(userId, userType, req.body);

    if (!profile) return next(new AppError('Profile not found', 404));

    return res.status(200).json(profile);
  } catch (error) {
    if (error instanceof AppError) return next(error);
    return next(new AppError('Failed to update profile', 500, { cause: error }));
  }
}

export async function changePasswordHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { userId, userType } = await resolveIdentity(req);
    await changePasswordService(userId, userType, req.body);

    return res.status(200).json({ message: 'Password changed successfully' });
  } catch (error) {
    if (error instanceof AppError) return next(error);
    return next(new AppError('Failed to change password', 500, { cause: error }));
  }
}
