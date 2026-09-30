/*
 * Noqoody SmartECR reporting endpoints (List Transactions, Daily Summary).
 * These are plain-JSON GETs — NOT encrypted — authenticated with the X-Merchant-Key header.
 * They are read-only reconciliation/reporting helpers, separate from the payment flow.
 */

export interface NoqoodyReportingConfig {
  baseUrl: string;
  apiKey: string;
  requestTimeoutMs: number;
}

export class NoqoodyReportingError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'NoqoodyReportingError';
  }
}

/** Query params accepted by GET /api/merchant/transactions. */
export interface TransactionsQuery {
  fromDate?: string;
  toDate?: string;
  posDeviceId?: string;
  status?: string;
  type?: string;
  page?: number;
  pageSize?: number;
}

/** Query params accepted by GET /api/merchant/transactions/daily-summary. */
export interface DailySummaryQuery {
  fromDate?: string;
  toDate?: string;
  posDeviceId?: string;
}

async function getJson(
  config: NoqoodyReportingConfig,
  path: string,
  query: Record<string, string | number | undefined>,
): Promise<unknown> {
  const url = new URL(path, config.baseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json', 'x-merchant-key': config.apiKey },
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    });
  } catch (error) {
    throw new NoqoodyReportingError(502, `Noqoody reporting request failed: ${String(error)}`);
  }

  const text = await response.text();
  if (!response.ok) {
    throw new NoqoodyReportingError(
      response.status === 401 || response.status === 403 ? response.status : 502,
      `Noqoody responded ${response.status}: ${text.slice(0, 200)}`,
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new NoqoodyReportingError(502, 'Noqoody returned non-JSON reporting response');
  }
}

/** GET /api/merchant/transactions — paginated list of payments and refunds. */
export function listTransactions(
  config: NoqoodyReportingConfig,
  query: TransactionsQuery,
): Promise<unknown> {
  return getJson(config, '/api/merchant/transactions', { ...query });
}

/** GET /api/merchant/transactions/daily-summary — aggregated daily totals. */
export function dailySummary(
  config: NoqoodyReportingConfig,
  query: DailySummaryQuery,
): Promise<unknown> {
  return getJson(config, '/api/merchant/transactions/daily-summary', { ...query });
}
