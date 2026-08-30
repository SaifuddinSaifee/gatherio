/**
 * Malware scan adapter. A file's `file_asset.malware_scan_status` starts
 * `pending` and must stay `quarantined`/undownloadable until this
 * resolves it to `clean` or `infected` (Stage 8 worker job) — the state
 * machine is exercised from day one even though the noop driver always
 * says clean, so wiring a real scanner later doesn't touch the download
 * gate logic.
 */
export type ScanOutcome = 'clean' | 'infected';

export interface ScanAdapter {
  scan(params: { key: string }): Promise<{ outcome: ScanOutcome; details?: string }>;
}

let cached: ScanAdapter | undefined;

export async function getScanAdapter(): Promise<ScanAdapter> {
  if (cached) return cached;
  const { env } = await import('@/lib/env');
  if (env.SCAN_DRIVER === 'clamav') {
    throw new Error('SCAN_DRIVER=clamav not implemented yet — wire up before handling real client files.');
  }
  const { noopScanAdapter } = await import('./scan.noop');
  cached = noopScanAdapter();
  return cached;
}
