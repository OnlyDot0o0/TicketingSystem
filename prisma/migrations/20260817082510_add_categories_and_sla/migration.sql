-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Category_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accentColorHex" TEXT NOT NULL,
    "faqUrl" TEXT,
    "ticketPrefix" TEXT NOT NULL,
    "ticketSeq" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailMode" TEXT NOT NULL DEFAULT 'OPTIONAL',
    "contractNumberMode" TEXT NOT NULL DEFAULT 'OPTIONAL',
    "categoryMode" TEXT NOT NULL DEFAULT 'REQUIRED',
    "priorityMode" TEXT NOT NULL DEFAULT 'REQUIRED',
    "attachmentsMode" TEXT NOT NULL DEFAULT 'OPTIONAL',
    "slaUrgentHours" INTEGER NOT NULL DEFAULT 4,
    "slaHighDays" INTEGER NOT NULL DEFAULT 1,
    "slaMediumDays" INTEGER NOT NULL DEFAULT 3,
    "slaLowDays" INTEGER NOT NULL DEFAULT 5
);
INSERT INTO "new_Project" ("accentColorHex", "attachmentsMode", "categoryMode", "contractNumberMode", "createdAt", "emailMode", "faqUrl", "id", "name", "priorityMode", "slug", "ticketPrefix", "ticketSeq") SELECT "accentColorHex", "attachmentsMode", "categoryMode", "contractNumberMode", "createdAt", "emailMode", "faqUrl", "id", "name", "priorityMode", "slug", "ticketPrefix", "ticketSeq" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Category_projectId_idx" ON "Category"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_projectId_key_key" ON "Category"("projectId", "key");

-- DataMigration: backfill every EXISTING project with today's 6 default
-- categories, using the exact same key strings already stored on
-- Ticket.category (LOGIN_CONNECTIVITY / ROUTES_PATROLS / RECORDS_DATES /
-- PHOTOS_ATTACHMENTS / PERFORMANCE / OTHER), so no pre-existing ticket ends
-- up pointing at a category key that no longer resolves to a real row.
-- Projects created AFTER this migration get the same default set from
-- application code instead (see DEFAULT_CATEGORIES / createProjectAction in
-- src/app/dashboard/projects/actions.ts) — this INSERT only ever needs to
-- run once, against whatever projects already exist at migration time.
INSERT INTO "Category" ("id", "projectId", "key", "label", "order", "createdAt")
SELECT lower(hex(randomblob(16))), "id", 'LOGIN_CONNECTIVITY', 'الدخول والاتصال', 0, CURRENT_TIMESTAMP FROM "Project"
UNION ALL
SELECT lower(hex(randomblob(16))), "id", 'ROUTES_PATROLS', 'المسارات والدوريات', 1, CURRENT_TIMESTAMP FROM "Project"
UNION ALL
SELECT lower(hex(randomblob(16))), "id", 'RECORDS_DATES', 'السجلات والتواريخ', 2, CURRENT_TIMESTAMP FROM "Project"
UNION ALL
SELECT lower(hex(randomblob(16))), "id", 'PHOTOS_ATTACHMENTS', 'الصور والمرفقات', 3, CURRENT_TIMESTAMP FROM "Project"
UNION ALL
SELECT lower(hex(randomblob(16))), "id", 'PERFORMANCE', 'الأداء', 4, CURRENT_TIMESTAMP FROM "Project"
UNION ALL
SELECT lower(hex(randomblob(16))), "id", 'OTHER', 'أخرى', 5, CURRENT_TIMESTAMP FROM "Project";
