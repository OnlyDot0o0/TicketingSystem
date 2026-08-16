"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  isValidSlug,
  isValidHexColor,
  isValidTicketPrefix,
  isValidFullFieldMode,
  isValidRestrictedFieldMode,
} from "@/lib/projects";
import { getViewerScope, canAccessProject } from "@/lib/access";
import { isValidFieldType, slugifyKey, serializeOptions, parseOptions } from "@/lib/customFields";
import { revalidatePath } from "next/cache";

export type ProjectFormState = { error?: string; success?: string };

async function requireSuperAdmin() {
  const session = await auth();
  return session?.user.role === "SUPER_ADMIN" ? session : null;
}

export async function createProjectAction(
  _prev: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  const session = await requireSuperAdmin();
  if (!session) return { error: "غير مصرح. هذه الصفحة للمدير العام فقط." };

  const name = String(formData.get("name") || "").trim();
  const slug = String(formData.get("slug") || "").trim().toLowerCase();
  const ticketPrefix = String(formData.get("ticketPrefix") || "").trim().toUpperCase();
  const accentColorHex = String(formData.get("accentColorHex") || "").trim();
  const faqUrl = String(formData.get("faqUrl") || "").trim() || null;

  if (!name || !slug || !ticketPrefix || !accentColorHex) {
    return { error: "يرجى تعبئة جميع الحقول المطلوبة." };
  }
  if (!isValidSlug(slug)) {
    return { error: "المعرّف (slug) غير صالح — يجب أن يحتوي على أحرف إنجليزية صغيرة وأرقام وشرطات فقط." };
  }
  if (!isValidTicketPrefix(ticketPrefix)) {
    return { error: "بادئة رقم التذكرة غير صالحة — أحرف إنجليزية كبيرة وأرقام فقط (2-8 أحرف)." };
  }
  if (!isValidHexColor(accentColorHex)) {
    return { error: "لون غير صالح — استخدم صيغة hex مثل #276661." };
  }

  const existingSlug = await prisma.project.findUnique({ where: { slug } });
  if (existingSlug) return { error: "يوجد مشروع بنفس المعرّف مسبقًا." };

  await prisma.project.create({
    data: { name, slug, ticketPrefix, accentColorHex, faqUrl },
  });

  revalidatePath("/dashboard/projects");
  revalidatePath("/");
  return { success: `تم إنشاء المشروع "${name}" بنجاح. الصفحة متاحة الآن على /${slug}` };
}

export async function updateProjectAction(
  _prev: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  const session = await requireSuperAdmin();
  if (!session) return { error: "غير مصرح. هذه الصفحة للمدير العام فقط." };

  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const ticketPrefix = String(formData.get("ticketPrefix") || "").trim().toUpperCase();
  const accentColorHex = String(formData.get("accentColorHex") || "").trim();
  const faqUrl = String(formData.get("faqUrl") || "").trim() || null;

  if (!id) return { error: "مشروع غير صالح." };
  if (!name || !ticketPrefix || !accentColorHex) {
    return { error: "يرجى تعبئة جميع الحقول المطلوبة." };
  }
  if (!isValidTicketPrefix(ticketPrefix)) {
    return { error: "بادئة رقم التذكرة غير صالحة — أحرف إنجليزية كبيرة وأرقام فقط (2-8 أحرف)." };
  }
  if (!isValidHexColor(accentColorHex)) {
    return { error: "لون غير صالح — استخدم صيغة hex مثل #276661." };
  }

  await prisma.project.update({
    where: { id },
    data: { name, ticketPrefix, accentColorHex, faqUrl },
  });

  revalidatePath("/dashboard/projects");
  revalidatePath(`/dashboard/projects/${id}`);
  revalidatePath("/");
  return { success: "تم حفظ التعديلات." };
}

// --- Ticket-form field configuration ---------------------------------
// Editable by SUPER_ADMIN (any project) or ADMIN (their own project(s) only).

async function requireTicketFormManager(projectId: string) {
  const scope = await getViewerScope();
  if (!scope) return null;
  if (!scope.isSuperAdmin && !scope.permissions.canManageTicketForm) return null;
  if (!canAccessProject(scope, projectId)) return null;
  return scope;
}

export async function updateTicketFormConfigAction(
  _prev: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  const scope = await getViewerScope();
  if (!scope) return { error: "غير مصرح." };
  if (!scope.isSuperAdmin && !scope.permissions.canManageTicketForm) return { error: "غير مصرح." };

  const projectId = String(formData.get("projectId") || "");
  if (!projectId || !canAccessProject(scope, projectId)) return { error: "مشروع غير صالح." };

  const emailMode = String(formData.get("emailMode") || "");
  const contractNumberMode = String(formData.get("contractNumberMode") || "");
  const categoryMode = String(formData.get("categoryMode") || "");
  const priorityMode = String(formData.get("priorityMode") || "");
  const attachmentsMode = String(formData.get("attachmentsMode") || "");

  if (
    !isValidFullFieldMode(emailMode) ||
    !isValidFullFieldMode(contractNumberMode) ||
    !isValidFullFieldMode(attachmentsMode)
  ) {
    return { error: "قيمة غير صالحة لأحد إعدادات النموذج." };
  }
  if (!isValidRestrictedFieldMode(categoryMode) || !isValidRestrictedFieldMode(priorityMode)) {
    return { error: "التصنيف والأولوية يجب أن يكونا إلزامي أو اختياري فقط (لا يمكن إخفاؤهما)." };
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { emailMode, contractNumberMode, categoryMode, priorityMode, attachmentsMode },
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { success: "تم حفظ إعدادات نموذج التذكرة." };
}

// --- Team membership (SUPER_ADMIN only, from the project edit page) ---

export type MembershipFormState = { error?: string; success?: string };

export async function addProjectMemberAction(
  _prev: MembershipFormState,
  formData: FormData
): Promise<MembershipFormState> {
  const session = await requireSuperAdmin();
  if (!session) return { error: "غير مصرح. هذه الصفحة للمدير العام فقط." };

  const projectId = String(formData.get("projectId") || "");
  const userId = String(formData.get("userId") || "");
  if (!projectId || !userId) return { error: "بيانات غير صالحة." };

  const [project, user] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);
  if (!project || !user) return { error: "المشروع أو المستخدم غير موجود." };

  await prisma.projectMembership.upsert({
    where: { userId_projectId: { userId, projectId } },
    update: {},
    create: { userId, projectId },
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { success: `تمت إضافة ${user.name} إلى فريق المشروع.` };
}

export async function removeProjectMemberAction(projectId: string, userId: string) {
  const session = await requireSuperAdmin();
  if (!session) return;
  await prisma.projectMembership.deleteMany({ where: { projectId, userId } });
  revalidatePath(`/dashboard/projects/${projectId}`);
}

// --- Custom ticket-form fields (v3) ------------------------------------
// Editable by SUPER_ADMIN (any project) or anyone with the
// canManageTicketForm permission (built-in ADMIN, or a custom role with
// that toggle) scoped to their own project(s). Gates the field
// DEFINITIONS only — per-ticket VALUES are a baseline ticket-editing
// action available to any project member (see tickets/[id]/actions.ts).

export type CustomFieldFormState = { error?: string; success?: string };

export async function createCustomFieldAction(
  _prev: CustomFieldFormState,
  formData: FormData
): Promise<CustomFieldFormState> {
  const projectId = String(formData.get("projectId") || "");
  const scope = await requireTicketFormManager(projectId);
  if (!scope) return { error: "غير مصرح." };

  const label = String(formData.get("label") || "").trim();
  const fieldType = String(formData.get("fieldType") || "");
  const required = formData.get("required") === "on";
  const optionsRaw = String(formData.get("options") || "");

  if (!label) return { error: "يرجى كتابة تسمية الحقل." };
  if (!isValidFieldType(fieldType)) return { error: "نوع حقل غير صالح." };

  const options = fieldType === "SELECT"
    ? optionsRaw.split(/\r?\n/).map((o) => o.trim()).filter(Boolean)
    : [];
  if (fieldType === "SELECT" && options.length === 0) {
    return { error: "يرجى إدخال خيار واحد على الأقل لحقل من نوع قائمة اختيار." };
  }

  let key = slugifyKey(label);
  // Ensure uniqueness within the project — append a numeric suffix if the
  // derived key already exists (e.g. two fields both labeled "ملاحظات").
  let suffix = 1;
  while (await prisma.customField.findUnique({ where: { projectId_key: { projectId, key } } })) {
    suffix += 1;
    key = `${slugifyKey(label)}-${suffix}`;
  }

  const maxOrder = await prisma.customField.aggregate({ where: { projectId }, _max: { order: true } });

  await prisma.customField.create({
    data: {
      projectId,
      key,
      label,
      fieldType,
      required,
      options: options.length > 0 ? serializeOptions(options) : null,
      order: (maxOrder._max.order ?? -1) + 1,
    },
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { success: "تم إضافة الحقل." };
}

export async function updateCustomFieldAction(
  _prev: CustomFieldFormState,
  formData: FormData
): Promise<CustomFieldFormState> {
  const id = String(formData.get("id") || "");
  const field = await prisma.customField.findUnique({ where: { id } });
  if (!field) return { error: "الحقل غير موجود." };

  const scope = await requireTicketFormManager(field.projectId);
  if (!scope) return { error: "غير مصرح." };

  const label = String(formData.get("label") || "").trim();
  const required = formData.get("required") === "on";
  const optionsRaw = String(formData.get("options") || "");

  if (!label) return { error: "يرجى كتابة تسمية الحقل." };

  // fieldType and key are intentionally not editable after creation — both
  // affect how existing TicketFieldValue rows must be interpreted, and
  // changing them out from under already-submitted tickets would silently
  // corrupt/mis-render historical data. Delete and re-create instead.
  const options = field.fieldType === "SELECT"
    ? optionsRaw.split(/\r?\n/).map((o) => o.trim()).filter(Boolean)
    : parseOptions(field.options);
  if (field.fieldType === "SELECT" && options.length === 0) {
    return { error: "يرجى إدخال خيار واحد على الأقل لحقل من نوع قائمة اختيار." };
  }

  await prisma.customField.update({
    where: { id },
    data: {
      label,
      required,
      options: field.fieldType === "SELECT" ? serializeOptions(options) : field.options,
    },
  });

  revalidatePath(`/dashboard/projects/${field.projectId}`);
  return { success: "تم حفظ التعديلات." };
}

export async function deleteCustomFieldAction(id: string) {
  const field = await prisma.customField.findUnique({ where: { id } });
  if (!field) return;
  const scope = await requireTicketFormManager(field.projectId);
  if (!scope) return;
  await prisma.customField.delete({ where: { id } });
  revalidatePath(`/dashboard/projects/${field.projectId}`);
}

// Swaps this field's `order` with its immediate neighbor (direction "up" =
// toward index 0). Simple adjacent-swap reordering — sufficient for the
// small, hand-managed field lists this feature targets; no drag-and-drop.
export async function moveCustomFieldAction(id: string, direction: "up" | "down") {
  const field = await prisma.customField.findUnique({ where: { id } });
  if (!field) return;
  const scope = await requireTicketFormManager(field.projectId);
  if (!scope) return;

  const siblings = await prisma.customField.findMany({
    where: { projectId: field.projectId },
    orderBy: { order: "asc" },
  });
  const idx = siblings.findIndex((s) => s.id === id);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx === -1 || swapIdx < 0 || swapIdx >= siblings.length) return;

  const other = siblings[swapIdx];
  await prisma.$transaction([
    prisma.customField.update({ where: { id: field.id }, data: { order: other.order } }),
    prisma.customField.update({ where: { id: other.id }, data: { order: field.order } }),
  ]);

  revalidatePath(`/dashboard/projects/${field.projectId}`);
}
