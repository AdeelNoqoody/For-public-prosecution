import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../errors';
import {
  dailySummary,
  listTransactions,
  NoqoodyReportingError,
  type NoqoodyReportingConfig,
} from '../pos/noqoodyReporting';

/*
 * Read-only reporting routes backed by the Noqoody reporting endpoints:
 *   GET /api/reports/transactions    → Noqoody GET /api/merchant/transactions
 *   GET /api/reports/daily-summary   → Noqoody GET /api/merchant/transactions/daily-summary
 * Only available when POS_PROVIDER=real (the mock POS has no reporting API).
 *
 * NOTE: like the rest of the local API these have no authentication yet — restrict/authenticate
 * before exposing beyond a trusted network (see SETTINGS.md).
 */

const STATUSES = ['Pending', 'Processing', 'Completed', 'Failed', 'Cancelled', 'Timeout'] as const;

const TransactionsQuerySchema = z.object({
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  posDeviceId: z.string().optional(),
  status: z.enum(STATUSES).optional(),
  type: z.enum(['payment', 'refund']).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(50).optional(),
});

const DailySummaryQuerySchema = z.object({
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  posDeviceId: z.string().optional(),
});

export interface ReportRoutesOptions {
  /** True only when POS_PROVIDER=real and an API key is configured. */
  enabled: boolean;
  reporting: NoqoodyReportingConfig;
}

export function registerReportRoutes(app: FastifyInstance, opts: ReportRoutesOptions): void {
  const ensureEnabled = (): void => {
    if (!opts.enabled) {
      throw new HttpError(
        501,
        'REPORTS_UNAVAILABLE',
        'Reports require POS_PROVIDER=real with a Noqoody API key',
      );
    }
  };

  const run = async (fn: () => Promise<unknown>): Promise<unknown> => {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof NoqoodyReportingError) {
        throw new HttpError(error.status, 'REPORT_ERROR', error.message);
      }
      throw error;
    }
  };

  app.get('/api/reports/transactions', async (request) => {
    ensureEnabled();
    const query = TransactionsQuerySchema.parse(request.query);
    return run(() => listTransactions(opts.reporting, query));
  });

  app.get('/api/reports/daily-summary', async (request) => {
    ensureEnabled();
    const query = DailySummaryQuerySchema.parse(request.query);
    return run(() => dailySummary(opts.reporting, query));
  });
}
