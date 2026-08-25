// Shared helper so vitest.config.ts and tests/globalSetup.ts compute the
// EXACT same DATABASE_URL for the test database, and so it's obviously never
// prisma/dev.db. A SEPARATE sqlite file (prisma/test.db, gitignored) is used
// so the automated suite can run repeatedly without depending on or
// corrupting whatever's already in the real dev database.
//
// `connection_limit=1` forces Prisma's query engine to serialize every
// query/transaction through a single connection instead of opening several
// concurrent connections to the same sqlite file, which would otherwise
// intermittently fail with "database is locked" under anything that fires
// concurrent queries (see tests/integration/ticketNumber.test.ts, which
// deliberately does that to exercise the atomic-increment race).
import path from "node:path";

export function testDatabaseUrl(): string {
  const dbPath = path.join(__dirname, "..", "prisma", "test.db").replace(/\\/g, "/");
  return `file:${dbPath}?connection_limit=1`;
}
