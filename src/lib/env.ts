import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  APP_URL: z.string().url().default('http://localhost:3000'),
  AUTH_SECRET: z.string().min(16),

  STORAGE_DRIVER: z.enum(['local', 'r2']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('.storage'),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_ENDPOINT: z.string().url().optional(),

  NOTIFY_DRIVER: z.enum(['local', 'smtp', 'postmark']).default('local'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  MAIL_FROM: z.string().default('Gather <no-reply@gather.local>'),
  POSTMARK_TOKEN: z.string().optional(),

  SCAN_DRIVER: z.enum(['noop', 'clamav']).default('noop'),

  // --- Recipient page (Stage 6) --------------------------------------
  UPLOAD_MAX_BYTES: z.coerce.number().default(26_214_400), // 25 MB
  UPLOAD_PRESIGN_TTL_SECONDS: z.coerce.number().default(900),
  RECIPIENT_SESSION_TTL_SECONDS: z.coerce.number().default(3600),
});

/**
 * Parsed once at module load. Fails fast on a missing/malformed var instead
 * of surfacing as an undefined deep in an adapter at request time.
 */
export const env = envSchema.parse(process.env);

export type Env = typeof env;
