import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// For a load balancer / uptime monitor / orchestrator health probe once
// this is actually deployed somewhere. Checks the database with a trivial
// query rather than just returning 200 unconditionally — a process that's
// up but can't reach its database is not actually healthy, and that's the
// single most likely real-world failure mode for this app (see the
// Postgres migration notes in README.md).
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "ok" });
  } catch (err) {
    console.error("[health] database check failed", err);
    return NextResponse.json({ status: "error", db: "unreachable" }, { status: 503 });
  }
}
