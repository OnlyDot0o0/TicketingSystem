-- CreateIndex
CREATE INDEX "Ticket_projectId_createdAt_idx" ON "Ticket"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Ticket_projectId_status_idx" ON "Ticket"("projectId", "status");

-- CreateIndex
CREATE INDEX "Ticket_projectId_slaDueAt_idx" ON "Ticket"("projectId", "slaDueAt");
