// Runs ONCE for the whole `vitest run`, before any test file. Resets the
// dedicated test sqlite database (prisma/test.db) to a clean, fully-migrated
// state so every run starts from the same known schema, with zero leftover
// rows from a previous run — and, critically, never touches prisma/dev.db.
import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { testDatabaseUrl } from "./testDbUrl";

export default async function globalSetup() {
  const root = path.join(__dirname, "..");
  const databaseUrl = testDatabaseUrl();

  // Derive the plain filesystem path back out of the file: URL (strip the
  // scheme and the ?connection_limit=1 query string) so we can delete any
  // leftover db/journal/wal/shm files from a previous, possibly-interrupted
  // run before migrating fresh.
  const filePath = databaseUrl.replace(/^file:/, "").split("?")[0];
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const p = filePath + suffix;
    if (fs.existsSync(p)) fs.rmSync(p);
  }

  execSync("npx prisma migrate deploy", {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });
}
