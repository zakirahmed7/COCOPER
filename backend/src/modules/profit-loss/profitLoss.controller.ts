import type { Request, Response } from 'express';
import { verifyAuthToken } from '../auth/auth.token.js';
import { getProfitLossStockSnapshot } from './profitLoss.repository.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function getProfitLossStockSnapshotHandler(req: Request, res: Response): Promise<void> {
  const fromDate = String(req.query.fromDate ?? '');
  const toDate = String(req.query.toDate ?? '');
  if (!ISO_DATE.test(fromDate) || !ISO_DATE.test(toDate)) {
    res.status(400).json({ success: false, message: 'Valid fromDate and toDate values are required.' });
    return;
  }

  try {
    const authorization = req.header('authorization') ?? '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    const claims = token ? await verifyAuthToken(token) : null;
    const organizationId = req.header('x-organization-id') ?? claims?.organizationId ?? null;
    const snapshot = await getProfitLossStockSnapshot(fromDate, toDate, organizationId);
    res.json({ success: true, data: snapshot });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message ?? 'Unable to calculate stock valuation.' });
  }
}
