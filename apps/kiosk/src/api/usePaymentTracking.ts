import { useCallback, useEffect, useRef, useState } from 'react';
import { PaymentSocketMessageSchema, isFinalStatus, type PaymentView } from '@kiosk/shared';
import { wsBaseUrl } from '../config/runtime';
import { api } from './client';

export type ConnectionState = 'connecting' | 'open' | 'reconnecting';

const MAX_BACKOFF_MS = 5_000;
/** Poll over REST while the socket is down, or once the result is overdue. */
const FALLBACK_POLL_MS = 4_000;
const OVERDUE_GRACE_MS = 10_000;

/**
 * Tracks a payment live over WebSocket (ws://server/payments/:id).
 * On disconnect it reconnects with backoff and re-fetches GET /api/payments/:id so no
 * update is missed; it also polls over REST if the result is overdue.
 */
export function usePaymentTracking(initial: PaymentView) {
  const [payment, setPayment] = useState<PaymentView>(initial);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const latest = useRef(initial);
  const socketRef = useRef<WebSocket | null>(null);
  const paymentId = initial.paymentId;

  const applyUpdate = useCallback(
    (next: PaymentView) => {
      if (next.paymentId !== paymentId) return;
      // Never regress from a final state (e.g. an out-of-order REST response).
      if (isFinalStatus(latest.current.status)) return;
      latest.current = next;
      setPayment(next);
      if (isFinalStatus(next.status)) socketRef.current?.close(1000, 'final');
    },
    [paymentId],
  );

  useEffect(() => {
    let disposed = false;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const refresh = () =>
      api
        .getPayment(paymentId)
        .then((next) => !disposed && applyUpdate(next))
        .catch(() => undefined);

    const connect = () => {
      if (disposed || isFinalStatus(latest.current.status)) return;
      const socket = new WebSocket(`${wsBaseUrl}/payments/${encodeURIComponent(paymentId)}`);
      socketRef.current = socket;
      socket.onopen = () => {
        attempt = 0;
        setConnection('open');
      };
      socket.onmessage = (event) => {
        try {
          const message = PaymentSocketMessageSchema.parse(JSON.parse(String(event.data)));
          if (message.type !== 'error' && !disposed) applyUpdate(message.payment);
        } catch {
          // Ignore malformed messages; the REST fallback keeps the state correct.
        }
      };
      socket.onclose = () => {
        if (socketRef.current === socket) socketRef.current = null;
        if (disposed || isFinalStatus(latest.current.status)) return;
        setConnection('reconnecting');
        void refresh();
        reconnectTimer = setTimeout(connect, Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempt++));
      };
    };

    connect();

    const poll = setInterval(() => {
      const current = latest.current;
      if (isFinalStatus(current.status)) return;
      const overdue =
        current.expiresAt !== null && Date.now() > Date.parse(current.expiresAt) + OVERDUE_GRACE_MS;
      if (overdue || socketRef.current?.readyState !== WebSocket.OPEN) void refresh();
    }, FALLBACK_POLL_MS);

    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      clearInterval(poll);
      socketRef.current?.close(1000, 'unmount');
      socketRef.current = null;
    };
  }, [paymentId, applyUpdate]);

  return { payment, connection, applyUpdate };
}
