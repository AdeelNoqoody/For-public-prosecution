import type { DataProvider } from '@kiosk/shared';
import type { ServerConfig } from '../config';
import { MockDataProvider } from './MockDataProvider';
import { RealDataProvider } from './RealDataProvider';

export function createDataProvider(config: ServerConfig): DataProvider {
  if (config.DATA_PROVIDER === 'real') return new RealDataProvider();
  return new MockDataProvider({
    latencyMinMs: config.MOCK_LATENCY_MIN_MS,
    latencyMaxMs: config.MOCK_LATENCY_MAX_MS,
  });
}
