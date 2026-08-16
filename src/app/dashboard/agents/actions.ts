"use server";

import { prisma } from "@/lib/prisma";
import { getViewerScope, canAccessProject } from "@/lib/access";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

export type CreateAgentState = { error?: string; success?: string };

function randomTempPassword() {
  return `Raq${Math.random().toString(36).slice(2, 8)}!${Math.floor(Math.random() * 90 + 10)}`;
}

// Role select values are either a built-in role code ("ADMIN" | "AGENT" |
// "SUPER_ADMIN") or "CUSTOM:<customRoleId>" for a custom role. This decodes
// that into { role, customRoleId } ready to write to User.
function decodeRoleSelection(raw: string): { role: string; customRoleId: string | null } | null {
  if (raw === "SUPER_ADMIN" || raw === "ADMIN" || raw === "AGENT") {
    return { role: raw, customRoleId: null };
  }
  if (raw.startsWith("CUSTOM:")) {
    const id = raw.slice("CUSTOM:".length);
    if (!id) return null;
    return { role: "CUSTOM", customRoleId: id };
  }
  return null;
}

// SUPER_ADMIN can assign any built-in role or any custom role. Anyone with
// the canManageTeam permission (built-in ADMIN, or a custom role with that
// toggle on) can assign ADMIN/AGENT/any custom role, but can NEVER grant
// SUPER_ADMIN — only SUPER_ADMIN itself can do that. AGENT (and any
// custom role without canManageTeam) has no access to this page at all.
async function allowedRoleSelectionsFor(scope: NonNullable<Awaited<ReturnType<typeof getViewerScope>>>): Promise<string[]> {
  if (scope.isSuperAdmin || scope.permissions.canManageTeam) {
    const customRoles = await prisma.customRole.findMany({ select: { id: true } });
    const base = ["ADMIN", "AGENT", ...customRoles.map((r) => `CUSTOM:${r.id}`)];
    return scope.isSuperAdmin ? ["SUPER_ADMIN", ...base] : base;
  }
  return [];
}

export async function createAgentAction(
  _prev: CreateAgentState,
  formData: FormData
): Promise<CreateAgentState> {
  const scope = await getViewerScope();
  if (!scope) return { error: "غير مصرح." };
  const allowed = await allowedRoleSelectionsFor(scope);
  if (allowed.length === 0) return { error: "غير مصرح." };

  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const roleSelection = String(formData.get("role") || "AGENT");
  const projectIds = formData.getAll("projectIds").map(String).filter(Boolean);

  if (!name || !email) return { error: "يرجى تعبئة الاسم والبريد الإلكتروني." };
  if (!allowed.includes(roleSelection)) return { error: "دور غير صالح أو غير مسموح لك بتعيينه." };
  const decoded = decodeRoleSelection(roleSelection);
  if (!decoded) return { error: "دور غير صالح." };

  // ADMIN (project-scoped, non-SUPER_ADMIN): must assign the new account to
  // at least one project, and only to project(s) the viewer itself belongs
  // to — never to a project they don't have membership in.
  if (!scope.isSuperAdmin) {
    if (projectIds.length === 0) {
      return { error: "يرجى اختيار مشروع واحد على الأقل لتعيين الحساب الجديد إليه." };
    }
    for (const pid of projectIds) {
      if (!canAccessProject(scope, pid)) {
        return { error: "لا يمكنك تعيين حسابات لمشاريع لست عضوًا فيها." };
      }
    }
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "يوجد مستخدم بنفس البريد الإلكتروني مسبقًا." };

  const tempPassword = randomTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const user = await prisma.user.create({
    data: { name, email, passwordHash, role: decoded.role as never, customRoleId: decoded.customRoleId },
  });

  if (projectIds.length > 0 && decoded.role !== "SUPER_ADMIN") {
    // SQLite's Prisma client doesn't support createMany's skipDuplicates,
    // so upsert one at a time (projectIds is a small, form-bounded list).
    for (const projectId of projectIds) {
      await prisma.projectMembership.upsert({
        where: { userId_projectId: { userId: user.id, projectId } },
        update: {},
        create: { userId: user.id, projectId },
      });
    }
  }

  revalidatePath("/dashboard/agents");
  return { success: `تم إنشاء الحساب. كلمة المرور المؤقتة: ${tempPassword} (يرجى إبلاغها للموظف وتغييرها فور الدخول)` };
}

// A project-scoped ADMIN (or a custom role with canManageTeam) may only
// manage a user whose access is entirely WITHIN what the acting admin can
// see — not just "shares at least one project". Deactivating a user or
// changing their role affects that user's access to ALL of their
// projects, not just the shared one; if the target also belongs to a
// project the actor can't see, the actor would be making a decision with
// consequences they have no visibility into. Requiring the target's full
// membership set to be a subset of the actor's closes that gap.
async function canManageUser(scope: NonNullable<Awaited<ReturnType<typeof getViewerScope>>>, userId: string): Promise<boolean> {
  if (scope.isSuperAdmin) return true;
  if (scope.userId === userId) return true;
  const targetMemberships = await prisma.projectMembership.findMany({
    where: { userId },
    select: { projectId: true },
  });
  if (targetMemberships.length === 0) return false; // no shared ground to manage them on
  const actorProjectIds = new Set(scope.projectIds || []);
  return targetMemberships.every((m) => actorProjectIds.has(m.projectId));
}

export async function toggleAgentActiveAction(userId: string, active: boolean) {
  const scope = await getViewerScope();
  if (!scope) return;
  const allowed = await allowedRoleSelectionsFor(scope);
  if (allowed.length === 0) return;
  if (scope.userId === userId && !active) return; // don't let someone deactivate themselves
  if (!(await canManageUser(scope, userId))) return;
  await prisma.user.update({ where: { id: userId }, data: { active } });
  revalidatePath("/dashboard/agents");
}

export async function updateAgentRoleAction(userId: string, roleSelection: string) {
  const scope = await getViewerScope();
  if (!scope) return;
  const allowed = await allowedRoleSelectionsFor(scope);
  if (allowed.length === 0) return;
  if (!allowed.includes(roleSelection)) return; // e.g. non-SUPER_ADMIN trying to grant SUPER_ADMIN — silently refused
  const decoded = decodeRoleSelection(roleSelection);
  if (!decoded) return;
  if (scope.userId === userId) return; // don't let someone change their own role
  if (!(await canManageUser(scope, userId))) return;
  await prisma.user.update({ where: { id: userId }, data: { role: decoded.role, customRoleId: decoded.customRoleId } });
  revalidatePath("/dashboard/agents");
}
