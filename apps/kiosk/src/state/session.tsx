import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from 'react';
import type { PayableItem, PaymentView, ServiceResult, VehicleResult } from '@kiosk/shared';

export type Screen =
  | { name: 'home' }
  | { name: 'services' }
  | { name: 'otherServices' }
  | { name: 'plateEntry'; serviceId: string }
  | { name: 'vehicleResult'; serviceId: string; result: VehicleResult }
  | { name: 'serviceForm'; serviceId: string }
  | { name: 'serviceResult'; serviceId: string; result: ServiceResult }
  | { name: 'paymentSummary' }
  | { name: 'paymentWaiting'; payment: PaymentView }
  | { name: 'paymentResult'; payment: PaymentView };

export type ScreenName = Screen['name'];

interface SessionState {
  screen: Screen;
  history: Screen[];
  /** Items the user chose to pay. */
  cart: PayableItem[];
  /** Increments on every reset; used as a React key to discard all screen state. */
  sessionId: number;
  /** True while something must not be interrupted by the idle timer (e.g. creating a payment). */
  busy: boolean;
}

type Action =
  | { type: 'navigate'; screen: Screen; replace?: boolean }
  | { type: 'back' }
  | { type: 'reset' }
  | { type: 'setCart'; items: PayableItem[] }
  | { type: 'setBusy'; busy: boolean };

const initialState: SessionState = {
  screen: { name: 'home' },
  history: [],
  cart: [],
  sessionId: 0,
  busy: false,
};

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case 'navigate':
      return {
        ...state,
        screen: action.screen,
        history: action.replace ? state.history : [...state.history, state.screen],
      };
    case 'back': {
      const previous = state.history.at(-1);
      if (!previous) return state;
      return { ...state, screen: previous, history: state.history.slice(0, -1) };
    }
    case 'reset':
      // Clears ALL session data: navigation, lookups, cart and payment.
      return { ...initialState, sessionId: state.sessionId + 1 };
    case 'setCart':
      return { ...state, cart: action.items };
    case 'setBusy':
      return { ...state, busy: action.busy };
  }
}

interface SessionValue extends SessionState {
  navigate(screen: Screen, options?: { replace?: boolean }): void;
  back(): void;
  reset(): void;
  setCart(items: PayableItem[]): void;
  setBusy(busy: boolean): void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const navigate = useCallback(
    (screen: Screen, options?: { replace?: boolean }) =>
      dispatch({ type: 'navigate', screen, replace: options?.replace }),
    [],
  );
  const back = useCallback(() => dispatch({ type: 'back' }), []);
  const reset = useCallback(() => dispatch({ type: 'reset' }), []);
  const setCart = useCallback((items: PayableItem[]) => dispatch({ type: 'setCart', items }), []);
  const setBusy = useCallback((busy: boolean) => dispatch({ type: 'setBusy', busy }), []);

  const value = useMemo(
    () => ({ ...state, navigate, back, reset, setCart, setBusy }),
    [state, navigate, back, reset, setCart, setBusy],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
