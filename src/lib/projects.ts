import { notFound } from "next/navigation";
import { prisma } from "./prisma";

export type Project = Awaited<ReturnType<typeof prisma.project.findUnique>>;

// Resolves a project by its URL slug, or triggers Next's 404 page when the
// slug doesn't match any project. Used by every project-scoped public route
// (`/{slug}`, `/{slug}/tickets/new`, `/{slug}/tickets/track`).
export async function getProjectBySlugOr404(slug: string) {
  const project = await prisma.project.findUnique({ where: { slug } });
  if (!project) notFound();
  return project;
}

export async function listActiveProjects() {
  return prisma.project.findMany({ orderBy: { createdAt: "asc" } });
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && slug.length >= 2 && slug.length <= 40;
}

const HEX_COLOR_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

export function isValidHexColor(hex: string): boolean {
  return HEX_COLOR_RE.test(hex);
}

export function isValidTicketPrefix(prefix: string): boolean {
  return /^[A-Z0-9]{2,8}$/.test(prefix);
}

// Per-project ticket-form field configuration. email/contractNumber/
// attachments may be REQUIRED, OPTIONAL, or HIDDEN. category/priority are
// restricted to REQUIRED/OPTIONAL only — they drive routing/SLA, so even
// when OPTIONAL a sensible default is applied server-side if left blank.
export type TicketFormConfig = {
  emailMode: "REQUIRED" | "OPTIONAL" | "HIDDEN";
  contractNumberMode: "REQUIRED" | "OPTIONAL" | "HIDDEN";
  categoryMode: "REQUIRED" | "OPTIONAL";
  priorityMode: "REQUIRED" | "OPTIONAL";
  attachmentsMode: "REQUIRED" | "OPTIONAL" | "HIDDEN";
};

export const DEFAULT_TICKET_FORM_CONFIG: TicketFormConfig = {
  emailMode: "OPTIONAL",
  contractNumberMode: "OPTIONAL",
  categoryMode: "REQUIRED",
  priorityMode: "REQUIRED",
  attachmentsMode: "OPTIONAL",
};

export function isValidFullFieldMode(v: string): v is "REQUIRED" | "OPTIONAL" | "HIDDEN" {
  return v === "REQUIRED" || v === "OPTIONAL" || v === "HIDDEN";
}

export function isValidRestrictedFieldMode(v: string): v is "REQUIRED" | "OPTIONAL" {
  return v === "REQUIRED" || v === "OPTIONAL";
}
