// Periodic SLA-breach WARNING check — a proactive heads-up sent once a
// ticket's remaining time drops under threshold (see needsSlaWarning() in
// src/lib/sla.ts), as opposed to isOverdue() which only reports a breach
// AFTER it's already happened.
//
// Registered once from src/instrumentation.ts when the Next.js server
// process boots (Next.js's instrumentation hook, stable since Next 14).
//
// Same single-instance caveat as src/lib/rateLimit.ts's in-memory rate
// limiter: this is a `setInterval` living in this one server process. It's
// correct and sufficient for this single-instance deployment — every
// ticket lives in the one shared database, and the one process running the
// timer sees all of them. A real production/multi-instance deploy (several
// Next.js instances behind a load balancer, or a serverless/edge platform
// that doesn't keep a long-lived Node process running at all) would need
// this moved out of the process — a proper external scheduler (a cron job
// or queue worker hitting a dedicated endpoint) — so the check runs exactly
// once per interval instead of once per instance. Duplicate runs wouldn't
// double-send warnings within a single instance (slaWarningSentAt is
// written back to the DB as each warning goes out, and a second overlapping
// run would simply find slaWarningSentAt already set and skip it — see
// checkSlaWarnings below) — this is the same class of risk as the fixed-
// window rate limiter losing precision across processes, not a correctness
// bug within one process, but it's real risk across multiple instances,
// where two instances could both read slaWarningSentAt as null in the same
// window and both send.

import { prisma } from "./prisma";
import { needsSlaWarning } from "./sla";
import { notifySlaWarning } from "./notifications";
import { PRIORITY_LABELS } from "./config";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

let started = false;

// Guard against double-registration: instrumentation.ts's register() can
// run more than once in the same process (Next.js dev-mode hot reload is
// the realistic case), and a second setInterval on top of the first would
// double-send every warning it finds. This module-level flag makes
// starting the scheduler a no-op the second time.
export function startSlaWarningScheduler() {
  if (started) return;
  started = true;

  setInterval(() => {
    checkSlaWarnings().catch((err) => {
      console.error("[slaWarningScheduler] check failed:", err);
    });
  }, CHECK_INTERVAL_MS);

  console.log(
    `[slaWarningScheduler] started — checking every ${CHECK_INTERVAL_MS / 60000} minute(s)`
  );
}

// Exported separately from startSlaWarningScheduler so it can also be
// invoked directly (e.g. a one-off manual run for verification) without
// waiting for the interval to tick.
export async function checkSlaWarnings(): Promise<{ warned: number; checked: number }> {
  // Coarse DB-level pre-filter: open tickets, not yet warned for their
  // current slaDueAt, not yet overdue (isOverdue()'s territory, not this
  // one). The actual 25%-of-window threshold (needsSlaWarning) still needs
  // each ticket's own createdAt/slaDueAt gap, which isn't something a
  // single WHERE clause can express cleanly across mixed wall-clock-hours
  // (URGENT) and business-day (HIGH/MEDIUM/LOW) windows — so that final
  // check happens in JS below, same as this app's ticket-queue/report code
  // elsewhere already mixes a DB pre-filter with an in-process check where
  // pushing the whole thing into SQL would cost more clarity than it saves.
  const candidates = await prisma.ticket.findMany({
    where: {
      status: { notIn: ["RESOLVED", "CLOSED"] },
      slaWarningSentAt: null,
      slaDueAt: { gt: new Date() },
    },
    include: {
      project: true,
      assignedTo: { select: { email: true } },
    },
  });

  let warned = 0;
  for (const ticket of candidates) {
    if (!needsSlaWarning(ticket)) continue;

    await notifySlaWarning(
      {
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        priorityLabel: PRIORITY_LABELS[ticket.priority] || ticket.priority,
        slaDueAt: ticket.slaDueAt,
        assignedTo: ticket.assignedTo,
      },
      { id: ticket.projectId, slug: ticket.project.slug, name: ticket.project.name }
    );

    // Written back immediately after this ticket's own email attempt (not
    // batched at the end) so a crash partway through one run can't cause
    // tickets already warned in this same pass to be warned again on retry.
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { slaWarningSentAt: new Date() },
    });
    warned++;
  }

  return { warned, checked: candidates.length };
}
