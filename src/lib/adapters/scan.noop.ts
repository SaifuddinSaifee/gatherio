import type { ScanAdapter } from './scan';

/**
 * Always reports clean. Fine for local development against synthetic
 * test files; must not be the driver in front of a pilot customer's
 * actual tax documents (see SCAN_DRIVER=clamav's not-yet-implemented
 * guard in scan.ts).
 */
export function noopScanAdapter(): ScanAdapter {
  return {
    async scan() {
      return { outcome: 'clean' };
    },
  };
}
