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
import { DEFAULT_CATEGORIES, deriveCategoryKey } from "@/lib/categories";
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

  const project = await prisma.project.create({
    data: { name, slug, ticketPrefix, accentColorHex, faqUrl },
  });

  // Every new project starts with the same default 6-category set the app
  // used to share globally (v6) — fully editable afterward from this page,
  // but the public ticket form works immediately instead of requiring
  // manual category setup first.
  await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((c, i) => ({ projectId: project.id, key: c.key, label: c.label, order: i })),
  });

  await prisma.adminActivity.create({
    data: {
      actorName: session.user.name || "مدير عام",
      action: "PROJECT_CREATED",
      targetType: "PROJECT",
      targetLabel: name,
      toValue: slug,
    },
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

  const before = await prisma.project.findUnique({ where: { id } });

  await prisma.project.update({
    where: { id },
    data: { name, ticketPrefix, accentColorHex, faqUrl },
  });

  // Branding touches several fields at once (name/prefix/color/FAQ url) —
  // there's no single clean "the value" to diff the way a ticket's single-
  // field changes do, so only the name (the one field worth surfacing as a
  // before/after) is logged, and only when it actually changed.
  await prisma.adminActivity.create({
    data: {
      actorName: session.user.name || "مدير عام",
      action: "PROJECT_BRANDING_UPDATED",
      targetType: "PROJECT",
      targetLabel: name,
      fromValue: before && before.name !== name ? before.name : null,
      toValue: before && before.name !== name ? name : null,
    },
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

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: { emailMode, contractNumberMode, categoryMode, priorityMode, attachmentsMode },
  });

  // Five fields change together here — no single meaningful before/after
  // pair, so just the fact that it happened (and to which project) is
  // logged, same reasoning as the branding update above.
  await prisma.adminActivity.create({
    data: {
      actorName: scope.name || "مدير",
      action: "PROJECT_TICKET_FORM_UPDATED",
      targetType: "PROJECT",
      targetLabel: updated.name,
    },
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

  await prisma.adminActivity.create({
    data: {
      actorName: session.user.name || "مدير عام",
      action: "PROJECT_MEMBER_ADDED",
      targetType: "PROJECT",
      targetLabel: project.name,
      toValue: user.name,
    },
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { success: `تمت إضافة ${user.name} إلى فريق المشروع.` };
}

export async function removeProjectMemberAction(projectId: string, userId: string) {
  const session = await requireSuperAdmin();
  if (!session) return;

  const [project, user] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);

  await prisma.projectMembership.deleteMany({ where: { projectId, userId } });

  if (project && user) {
    await prisma.adminActivity.create({
      data: {
        actorName: session.user.name || "مدير عام",
        action: "PROJECT_MEMBER_REMOVED",
        targetType: "PROJECT",
        targetLabel: project.name,
        fromValue: user.name,
      },
    });
  }

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

// --- Ticket categories (v6) ---------------------------------------------
// Same shape/pattern and same canManageTicketForm gate as the custom-field
// definitions above. `key` is derived from `label` via the same
// slugifyKey() used for custom fields, de-duplicated per project the same
// way. Unlike CustomField, there's no `fieldType` to keep immutable — the
// only thing that must never change after tickets start referencing it is
// `key` itself (it's what's actually stored on Ticket.category), so `key`
// stays fixed after creation while `label` and `order` remain editable.

export type CategoryFormState = { error?: string; success?: string };

export async function createCategoryAction(
  _prev: CategoryFormState,
  formData: FormData
): Promise<CategoryFormState> {
  const projectId = String(formData.get("projectId") || "");
  const scope = await requireTicketFormManager(projectId);
  if (!scope) return { error: "غير مصرح." };

  const label = String(formData.get("label") || "").trim();
  if (!label) return { error: "يرجى كتابة تسمية التصنيف." };

  let key = deriveCategoryKey(label);
  let suffix = 1;
  while (await prisma.category.findUnique({ where: { projectId_key: { projectId, key } } })) {
    suffix += 1;
    key = `${deriveCategoryKey(label)}_${suffix}`;
  }

  const maxOrder = await prisma.category.aggregate({ where: { projectId }, _max: { order: true } });

  await prisma.category.create({
    data: { projectId, key, label, order: (maxOrder._max.order ?? -1) + 1 },
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { success: "تم إضافة التصنيف." };
}

export async function updateCategoryAction(
  _prev: CategoryFormState,
  formData: FormData
): Promise<CategoryFormState> {
  const id = String(formData.get("id") || "");
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) return { error: "التصنيف غير موجود." };

  const scope = await requireTicketFormManager(category.projectId);
  if (!scope) return { error: "غير مصرح." };

  const label = String(formData.get("label") || "").trim();
  if (!label) return { error: "يرجى كتابة تسمية التصنيف." };

  // `key` is intentionally not editable after creation — it's what's
  // already stored on every existing Ticket.category value for this
  // category, and changing it out from under those tickets would silently
  // orphan them (same reasoning as CustomField.key/fieldType being
  // immutable — see src/app/dashboard/projects/actions.ts above).
  await prisma.category.update({ where: { id }, data: { label } });

  revalidatePath(`/dashboard/projects/${category.projectId}`);
  return { success: "تم حفظ التعديلات." };
}

export type DeleteCategoryResult = { error?: string; success?: boolean };

// Blocks deleting a category that's still referenced by any ticket, rather
// than silently orphaning those tickets' `category` value — same precedent
// as deleteCustomRoleAction blocking deletion of an in-use CustomRole (see
// src/app/dashboard/roles/actions.ts). Also blocks deleting a project's
// LAST remaining category: Ticket.category is a non-nullable column, so a
// project with zero categories can never again produce a valid ticket
// (the public form's dropdown would be empty, and a REQUIRED/OPTIONAL
// categoryMode both need at least one real category to fall back to).
export async function deleteCategoryAction(id: string): Promise<DeleteCategoryResult> {
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) return { error: "التصنيف غير موجود." };

  const scope = await requireTicketFormManager(category.projectId);
  if (!scope) return { error: "غير مصرح." };

  const [inUseCount, totalCount] = await Promise.all([
    prisma.ticket.count({ where: { projectId: category.projectId, category: category.key } }),
    prisma.category.count({ where: { projectId: category.projectId } }),
  ]);
  if (inUseCount > 0) {
    return { error: `لا يمكن حذف هذا التصنيف — هناك ${inUseCount} تذكرة(تذاكر) لا تزال مصنّفة به.` };
  }
  if (totalCount <= 1) {
    return { error: "لا يمكن حذف آخر تصنيف في المشروع — يجب أن يبقى تصنيف واحد على الأقل." };
  }

  await prisma.category.delete({ where: { id } });
  revalidatePath(`/dashboard/projects/${category.projectId}`);
  return { success: true };
}

// Swaps this category's `order` with its immediate neighbor — same simple
// adjacent-swap reordering as moveCustomFieldAction above.
export async function moveCategoryAction(id: string, direction: "up" | "down") {
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) return;
  const scope = await requireTicketFormManager(category.projectId);
  if (!scope) return;

  const siblings = await prisma.category.findMany({
    where: { projectId: category.projectId },
    orderBy: { order: "asc" },
  });
  const idx = siblings.findIndex((s) => s.id === id);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx === -1 || swapIdx < 0 || swapIdx >= siblings.length) return;

  const other = siblings[swapIdx];
  await prisma.$transaction([
    prisma.category.update({ where: { id: category.id }, data: { order: other.order } }),
    prisma.category.update({ where: { id: other.id }, data: { order: category.order } }),
  ]);

  revalidatePath(`/dashboard/projects/${category.projectId}`);
}

// --- Per-project SLA-by-priority targets (v6) ----------------------------
// Same canManageTicketForm gate as everything else on this page. Column
// defaults on Project preserve today's global values, so leaving this form
// untouched changes nothing for an existing project.

export async function updateSlaConfigAction(
  _prev: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  const projectId = String(formData.get("projectId") || "");
  const scope = await requireTicketFormManager(projectId);
  if (!scope) return { error: "غير مصرح." };

  const slaUrgentHours = Number(formData.get("slaUrgentHours"));
  const slaHighDays = Number(formData.get("slaHighDays"));
  const slaMediumDays = Number(formData.get("slaMediumDays"));
  const slaLowDays = Number(formData.get("slaLowDays"));

  const values = { slaUrgentHours, slaHighDays, slaMediumDays, slaLowDays };
  for (const [k, v] of Object.entries(values)) {
    if (!Number.isInteger(v) || v <= 0) {
      return { error: "يرجى إدخال قيم صحيحة أكبر من صفر لجميع مهل الاستجابة (SLA)." };
    }
  }

  const updated = await prisma.project.update({ where: { id: projectId }, data: values });

  await prisma.adminActivity.create({
    data: {
      actorName: scope.name || "مدير",
      action: "PROJECT_SLA_UPDATED",
      targetType: "PROJECT",
      targetLabel: updated.name,
    },
  });

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { success: "تم حفظ إعدادات مهلة الاستجابة (SLA)." };
}
