"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export type RoleFormState = { error?: string; success?: string };

async function requireSuperAdmin() {
  const session = await auth();
  return session?.user.role === "SUPER_ADMIN" ? session : null;
}

function isValidBaseRole(v: string): v is "ADMIN" | "AGENT" {
  return v === "ADMIN" || v === "AGENT";
}

export async function createCustomRoleAction(
  _prev: RoleFormState,
  formData: FormData
): Promise<RoleFormState> {
  const session = await requireSuperAdmin();
  if (!session) return { error: "غير مصرح. هذه الصفحة للمدير العام فقط." };

  const name = String(formData.get("name") || "").trim();
  const baseRole = String(formData.get("baseRole") || "");
  const canManageTeam = formData.get("canManageTeam") === "on";
  const canManageTicketForm = formData.get("canManageTicketForm") === "on";
  const canViewReports = formData.get("canViewReports") === "on";
  const canManageCannedResponses = formData.get("canManageCannedResponses") === "on";

  if (!name) return { error: "يرجى كتابة اسم الدور." };
  if (!isValidBaseRole(baseRole)) return { error: "دور أساسي غير صالح." };

  const existing = await prisma.customRole.findUnique({ where: { name } });
  if (existing) return { error: "يوجد دور مخصص بنفس الاسم مسبقًا." };

  await prisma.customRole.create({
    data: { name, baseRole, canManageTeam, canManageTicketForm, canViewReports, canManageCannedResponses },
  });

  revalidatePath("/dashboard/roles");
  return { success: `تم إنشاء الدور "${name}".` };
}

export async function updateCustomRoleAction(
  _prev: RoleFormState,
  formData: FormData
): Promise<RoleFormState> {
  const session = await requireSuperAdmin();
  if (!session) return { error: "غير مصرح. هذه الصفحة للمدير العام فقط." };

  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const baseRole = String(formData.get("baseRole") || "");
  const canManageTeam = formData.get("canManageTeam") === "on";
  const canManageTicketForm = formData.get("canManageTicketForm") === "on";
  const canViewReports = formData.get("canViewReports") === "on";
  const canManageCannedResponses = formData.get("canManageCannedResponses") === "on";

  if (!id) return { error: "دور غير صالح." };
  if (!name) return { error: "يرجى كتابة اسم الدور." };
  if (!isValidBaseRole(baseRole)) return { error: "دور أساسي غير صالح." };

  const nameClash = await prisma.customRole.findFirst({ where: { name, id: { not: id } } });
  if (nameClash) return { error: "يوجد دور مخصص آخر بنفس الاسم." };

  await prisma.customRole.update({
    where: { id },
    data: { name, baseRole, canManageTeam, canManageTicketForm, canViewReports, canManageCannedResponses },
  });

  revalidatePath("/dashboard/roles");
  revalidatePath("/dashboard/agents");
  return { success: "تم حفظ التعديلات." };
}

export type DeleteRoleResult = { error?: string; success?: boolean };

// Blocks deleting a role that's currently assigned to any user, rather
// than silently reassigning them — reassigning would change someone's
// effective permissions as a side effect of an unrelated cleanup action,
// which is the more surprising/dangerous default. The admin must first
// move affected users to a different role from /dashboard/agents.
export async function deleteCustomRoleAction(id: string): Promise<DeleteRoleResult> {
  const session = await requireSuperAdmin();
  if (!session) return { error: "غير مصرح." };

  const assignedCount = await prisma.user.count({ where: { customRoleId: id } });
  if (assignedCount > 0) {
    return { error: `لا يمكن حذف هذا الدور — هناك ${assignedCount} حساب(ات) لا تزال معيّنة إليه. غيّر دورهم أولًا من صفحة "فريق الدعم".` };
  }

  await prisma.customRole.delete({ where: { id } });
  revalidatePath("/dashboard/roles");
  return { success: true };
}
