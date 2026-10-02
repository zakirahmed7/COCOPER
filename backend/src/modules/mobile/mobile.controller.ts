import type { NextFunction, Request, Response } from 'express';
import { verifyAuthToken } from '../auth/auth.token.js';
import { AppError } from '../../utils/AppError.js';
import { getMobileBootstrap as getMobileBootstrapService } from './mobile.service.js';
import {
  checkoutMobileAttendanceRepo,
  createMobileAttendanceRepo,
  listMobileAttendanceRepo,
  resolveAssignedBranchRepo,
} from './mobileAttendance.repository.js';

function getBearerToken(req: Request): string {
  const authorization = req.header('authorization') ?? '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
}

export async function getMobileBootstrapHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const token = getBearerToken(req);
    const claims = token ? await verifyAuthToken(token) : null;

    if (!claims) {
      return next(new AppError('A valid Bearer token is required', 401));
    }

    const bootstrap = await getMobileBootstrapService(claims.sub);

    if (!bootstrap) {
      return next(new AppError('Authenticated organization user not found', 401));
    }

    return res.status(200).json(bootstrap);
  } catch (error) {
    if (error instanceof AppError) return next(error);
    return next(new AppError('Failed to load mobile bootstrap data', 500, { cause: error }));
  }
}

async function getClaims(req: Request) {
  const token = getBearerToken(req);
  const claims = token ? await verifyAuthToken(token) : null;
  if (!claims) throw new AppError('A valid Bearer token is required', 401);
  return claims;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function createMobileAttendanceHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const claims = await getClaims(req);
    if (claims.isSuperAdmin || !claims.organizationId) {
      return next(new AppError('Only organization users can record mobile attendance', 403));
    }

    const labourName = String(req.body?.labour_name ?? '').trim();
    const branchId = String(req.header('x-branch-id') ?? '').trim();
    if (!labourName || labourName.length > 200 || !branchId || !isUuid(branchId)) {
      return next(new AppError('A valid labour_name and x-branch-id are required', 422));
    }

    const scope = await resolveAssignedBranchRepo(claims.sub, branchId);
    if (!scope) return next(new AppError('Branch is not assigned to this user', 403));

    const row = await createMobileAttendanceRepo(claims.sub, scope.organization_id, scope.branch_id, labourName);
    return res.status(201).json({ success: true, data: row });
  } catch (error) {
    return next(error instanceof AppError ? error : new AppError('Failed to record mobile attendance', 500, { cause: error }));
  }
}

export async function checkoutMobileAttendanceHandler(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const claims = await getClaims(req);
    if (!isUuid(req.params.id)) {
      return next(new AppError('A valid attendance id is required', 422));
    }
    const row = await checkoutMobileAttendanceRepo(claims.sub, req.params.id);
    if (!row) return next(new AppError('Open attendance record not found', 404));
    return res.status(200).json({ success: true, data: row });
  } catch (error) {
    return next(error instanceof AppError ? error : new AppError('Failed to close mobile attendance', 500, { cause: error }));
  }
}

export async function listMobileAttendanceHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const claims = await getClaims(req);
    if (claims.isSuperAdmin || !claims.organizationId) {
      return next(new AppError('Only organization users can view mobile attendance', 403));
    }
    const branchId = String(req.header('x-branch-id') ?? '').trim() || undefined;
    if (branchId && !(await resolveAssignedBranchRepo(claims.sub, branchId))) {
      return next(new AppError('Branch is not assigned to this user', 403));
    }
    const rows = await listMobileAttendanceRepo(claims.organizationId, branchId);
    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    return next(error instanceof AppError ? error : new AppError('Failed to load mobile attendance', 500, { cause: error }));
  }
}