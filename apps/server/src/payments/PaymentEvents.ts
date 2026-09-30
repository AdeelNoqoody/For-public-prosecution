import { EventEmitter } from 'node:events';
import type { PaymentView } from '@kiosk/shared';

type Listener = (payment: PaymentView) => void;

/** In-process pub/sub of payment updates, consumed by the WebSocket route. */
export class PaymentEvents {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish(payment: PaymentView): void {
    this.emitter.emit(payment.paymentId, payment);
  }

  subscribe(paymentId: string, listener: Listener): () => void {
    this.emitter.on(paymentId, listener);
    return () => this.emitter.off(paymentId, listener);
  }
}
