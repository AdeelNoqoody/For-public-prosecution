import type { IncomingHttpHeaders } from 'node:http';
import type { Logger } from 'pino';
import type { GenericPosConfig } from './MockPosProvider';
import type {
  PosCreateTransactionInput,
  PosProvider,
  PosTransaction,
  PosWebhookEvent,
} from './PosProvider';

/**
 * Adapter for the real POS vendor. Intentionally unimplemented until the vendor's API
 * specification is available — every TODO below depends on vendor-specific details.
 *
 * Checklist when implementing:
 *  - Auth: API key header? OAuth2 client-credentials (token caching + refresh)? mTLS?
 *  - Create: endpoint path, amount format (minor units vs decimal string), currency code,
 *    terminal/device id field, merchant reference + idempotency header, callback URL field.
 *  - Status/cancel endpoints and their status vocabulary → map to PosTransactionStatus.
 *  - Webhook: signature header name, algorithm, what is signed (raw body? timestamp + body?),
 *    timestamp location, event id for de-duplication, retry behaviour.
 *  - Card data: only ever keep a masked PAN (use `maskPan` from @kiosk/shared).
 */
export class RealPosProvider implements PosProvider {
  readonly name = 'real';

  constructor(
    private readonly config: GenericPosConfig,
    private readonly logger: Logger,
  ) {
    this.logger.warn('RealPosProvider is a stub — payments will fail until it is implemented');
  }

  async createTransaction(_input: PosCreateTransactionInput): Promise<PosTransaction> {
    // TODO(vendor): POST {POS_BASE_URL}/<vendor create path> with vendor auth and field names.
    void this.config;
    throw new Error('RealPosProvider.createTransaction is not implemented');
  }

  async getTransaction(_transactionId: string): Promise<PosTransaction> {
    // TODO(vendor): GET transaction status and map the vendor's status vocabulary.
    throw new Error('RealPosProvider.getTransaction is not implemented');
  }

  async cancelTransaction(_transactionId: string): Promise<PosTransaction> {
    // TODO(vendor): call the vendor's cancel/void endpoint for a pending terminal request.
    throw new Error('RealPosProvider.cancelTransaction is not implemented');
  }

  parseWebhook(_rawBody: Buffer, _headers: IncomingHttpHeaders): PosWebhookEvent {
    // TODO(vendor): verify the vendor's signature scheme and replay window, then validate
    // the payload with a Zod schema and map it to PosWebhookEvent.
    throw new Error('RealPosProvider.parseWebhook is not implemented');
  }
}
