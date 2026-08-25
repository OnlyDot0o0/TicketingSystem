import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { testDatabaseUrl } from "./tests/testDbUrl";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/globalSetup.ts"],
    // SQLite (even with connection_limit=1) is a single-writer file — running
    // test FILES in parallel worker processes against the same prisma/test.db
    // invites "database is locked" errors and cross-file state races. The
    // suite is small enough that running files sequentially costs little.
    fileParallelism: false,
    env: {
      // Dedicated test database — see tests/testDbUrl.ts. NEVER
      // prisma/dev.db: this is what keeps `npm test` safe to run repeatedly
      // without depending on or corrupting real dev data.
      DATABASE_URL: testDatabaseUrl(),
      NEXTAUTH_SECRET: "test-secret-for-vitest-do-not-use-in-production",
    },
    coverage: {
      provider: "v8",
      include: [
        "src/lib/**/*.ts",
        "src/app/dashboard/bulk-actions.ts",
        "src/app/dashboard/agents/actions.ts",
      ],
      exclude: [
        "src/lib/mail.ts",
        "src/lib/sentry.ts",
        "src/lib/prisma.ts",
      ],
    },
  },
});
