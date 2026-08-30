import PgBoss from 'pg-boss';
import { env } from '@/lib/env';

/**
 * Long-running worker process, separate from `next` (techstack.md: "a
 * single container plus one worker process"). Stage 8 registers the
 * reminder job here; scan and export jobs follow in later stages.
 */
async function main() {
  const boss = new PgBoss(env.DATABASE_URL);

  boss.on('error', (err) => console.error('[pg-boss]', err));

  await boss.start();
  console.log('Worker ready — no jobs registered yet (Stage 8).');

  const shutdown = async () => {
    await boss.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
