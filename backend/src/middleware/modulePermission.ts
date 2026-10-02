import type { NextFunction, Request, Response } from 'express';
import { verifyAuthToken } from '../modules/auth/auth.token.js';
import { pool } from '../config/db.js';

export function requireModulePermission(moduleCode: string, action: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authorization = req.header('authorization') ?? '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    let claims;
    try {
      claims = token ? await verifyAuthToken(token) : null;
    } catch (error) {
      next(error);
      return;
    }

    if (!claims) {
      res.status(401).json({ success: false, message: 'Authentication is required.' });
      return;
    }

    const requestedOrganizationId = req.header('x-organization-id');
    if (!claims.isSuperAdmin && requestedOrganizationId && requestedOrganizationId !== claims.organizationId) {
      res.status(403).json({ success: false, message: 'Organization access is not allowed.' });
      return;
    }

    if (claims.isSuperAdmin || claims.role.trim().toUpperCase() === 'OWNER') {
      next();
      return;
    }

    const permission = `${moduleCode}.${action}`;
    const result = await pool.query(
      'SELECT 1 FROM user_permissions WHERE user_id = $1 AND permission_code = $2 LIMIT 1',
      [claims.sub, permission],
    );

    if (!result.rowCount) {
      res.status(403).json({ success: false, message: `Permission required: ${permission}` });
      return;
    }

    next();
  };
}

export function requireModulePermissionForBody(
  moduleCode: string,
  resolveAction: (req: Request) => string,
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const action = resolveAction(req);
    const authorization = req.header('authorization') ?? '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    let claims;
    try {
      claims = token ? await verifyAuthToken(token) : null;
    } catch (error) {
      next(error);
      return;
    }
    if (!claims) {
      res.status(401).json({ success: false, message: 'Authentication is required.' });
      return;
    }
    const requestedOrganizationId = req.header('x-organization-id');
    if (!claims.isSuperAdmin && requestedOrganizationId && requestedOrganizationId !== claims.organizationId) {
      res.status(403).json({ success: false, message: 'Organization access is not allowed.' });
      return;
    }
    if (claims.isSuperAdmin || claims.role.trim().toUpperCase() === 'OWNER') {
      next();
      return;
    }
    const result = await pool.query(
      'SELECT 1 FROM user_permissions WHERE user_id = $1 AND permission_code = $2 LIMIT 1',
      [claims.sub, `${moduleCode}.${action}`],
    );
    if (!result.rowCount) {
      res.status(403).json({ success: false, message: `Permission required: ${moduleCode}.${action}` });
      return;
    }
    next();
  };
}
