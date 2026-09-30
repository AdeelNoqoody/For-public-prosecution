import { existsSync } from 'node:fs';
import path from 'node:path';

/** Walks up from `startDir` to find the monorepo's `.env` file. */
export function findEnvFile(
  startDir: string = process.cwd(),
  fileName = '.env',
): string | undefined {
  let dir = path.resolve(startDir);
  for (;;) {
    const candidate = path.join(dir, fileName);
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}
