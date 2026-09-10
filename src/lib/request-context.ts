/**
 * Extracts a client IP and user agent from request headers for
 * audit_event rows (Stage 6, first real callers of withAudit).
 *
 * audit_event.ip_address is a pg `inet` column — a malformed value
 * THROWS at insert time and rolls back the entire transaction, including
 * the state change the audit row was meant to record. `x-forwarded-for`
 * can be a comma-separated list (one entry per proxy hop) and can be
 * anything a client chooses to send ("unknown", garbage, multiple
 * addresses) — this module's whole job is turning that into either a
 * value Postgres will accept or `undefined`, never something that throws.
 */

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV4_WITH_PORT_PATTERN = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):\d+$/;
const BRACKETED_PATTERN = /^\[(.+)\](?::\d+)?$/;
const IPV6_LOOSE_PATTERN = /^[0-9a-fA-F:]+$/;

function isValidIpv4(candidate: string): boolean {
  const match = IPV4_PATTERN.exec(candidate);
  if (!match) return false;
  return match.slice(1, 5).every((octet) => Number(octet) <= 255);
}

function isValidIp(candidate: string): boolean {
  if (isValidIpv4(candidate)) return true;
  // Loose IPv6 check: at least one colon and nothing but hex digits/colons.
  // Not a full RFC 4291 validator — good enough to keep garbage out of an
  // `inet` column, which is this function's only job.
  return candidate.includes(':') && IPV6_LOOSE_PATTERN.test(candidate);
}

function normalizeIp(candidate: string): string | undefined {
  const bracketed = BRACKETED_PATTERN.exec(candidate);
  if (bracketed) {
    const inner = bracketed[1] ?? '';
    return isValidIp(inner) ? inner : undefined;
  }

  const ipv4WithPort = IPV4_WITH_PORT_PATTERN.exec(candidate);
  if (ipv4WithPort) {
    const ip = ipv4WithPort[1] ?? '';
    return isValidIp(ip) ? ip : undefined;
  }

  return isValidIp(candidate) ? candidate : undefined;
}

export function clientIp(headers: Headers): string | undefined {
  const raw = headers.get('x-forwarded-for');
  if (!raw) return undefined;
  const first = raw.split(',')[0]?.trim();
  if (!first) return undefined;
  return normalizeIp(first);
}

export function userAgent(headers: Headers): string | undefined {
  return headers.get('user-agent') ?? undefined;
}
