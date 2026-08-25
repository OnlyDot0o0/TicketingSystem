/*
  Warnings:

  - You are about to drop the `Counter` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `projectId` to the `Ticket` table without a default value. This is not possible if the table is not empty.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Counter";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accentColorHex" TEXT NOT NULL,
    "faqUrl" TEXT,
    "ticketPrefix" TEXT NOT NULL,
    "ticketSeq" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Ticket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketNumber" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "projectId" TEXT NOT NULL,
    "submitterName" TEXT NOT NULL,
    "submitterPhone" TEXT NOT NULL,
    "submitterEmail" TEXT,
    "contractNumber" TEXT,
    "assignedToId" TEXT,
    "slaDueAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "resolvedAt" DATETIME,
    CONSTRAINT "Ticket_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Ticket_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Ticket" ("assignedToId", "category", "contractNumber", "createdAt", "description", "id", "priority", "resolvedAt", "slaDueAt", "status", "subject", "submitterEmail", "submitterName", "submitterPhone", "ticketNumber", "updatedAt") SELECT "assignedToId", "category", "contractNumber", "createdAt", "description", "id", "priority", "resolvedAt", "slaDueAt", "status", "subject", "submitterEmail", "submitterName", "submitterPhone", "ticketNumber", "updatedAt" FROM "Ticket";
DROP TABLE "Ticket";
ALTER TABLE "new_Ticket" RENAME TO "Ticket";
CREATE UNIQUE INDEX "Ticket_ticketNumber_key" ON "Ticket"("ticketNumber");
CREATE INDEX "Ticket_status_idx" ON "Ticket"("status");
CREATE INDEX "Ticket_category_idx" ON "Ticket"("category");
CREATE INDEX "Ticket_priority_idx" ON "Ticket"("priority");
CREATE INDEX "Ticket_assignedToId_idx" ON "Ticket"("assignedToId");
CREATE INDEX "Ticket_submitterPhone_idx" ON "Ticket"("submitterPhone");
CREATE INDEX "Ticket_projectId_idx" ON "Ticket"("projectId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");
