// Minimal env so modules that import '@/lib/env' don't throw during unit
// tests that never touch the real database (integration tests under
// src/db use the real .env against the docker-compose Postgres instead).
process.env.DATABASE_URL ??= 'postgresql://gatherio:gatherio@localhost:5434/gatherio';
process.env.APP_URL ??= 'http://localhost:3000';
process.env.AUTH_SECRET ??= 'test-secret-not-for-production-000000000000';
