import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db } from './client';

async function main() {
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations applied.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
