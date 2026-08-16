"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getViewerScope, canAccessProject } from "@/lib/access";
import { revalidatePath } from "next/cache";

export type CannedFormState = { error?: string; success?: string };

async function requireProjectManager(projectId: string) {
  const scope = await getViewerScope();
  if (!scope) return null;
  if (!scope.isSuperAdmin && !scope.permissions.canManageCannedResponses) return null;
  if (!canAccessProject(scope, projectId)) return null;
  return scope;
}

export async function createCannedResponseAction(
  _prev: CannedFormState,
  formData: FormData
): Promise<CannedFormState> {
  const session = await auth();
  const projectId = String(formData.get("projectId") || "");
  const title = String(formData.get("title") || "").trim();
  const body = String(formData.get("body") || "").trim();

  if (!projectId || !title || !body) return { error: "يرجى تعبئة جميع الحقول." };

  const scope = await requireProjectManager(projectId);
  if (!scope || !session?.user) return { error: "غير مصرح." };

  await prisma.cannedResponse.create({
    data: { projectId, title, body, createdBy: session.user.name || session.user.email || "" },
  });

  revalidatePath("/dashboard/canned-responses");
  return { success: "تم إنشاء الرد الجاهز." };
}

export async function deleteCannedResponseAction(id: string) {
  const canned = await prisma.cannedResponse.findUnique({ where: { id } });
  if (!canned) return;
  const scope = await requireProjectManager(canned.projectId);
  if (!scope) return;
  await prisma.cannedResponse.delete({ where: { id } });
  revalidatePath("/dashboard/canned-responses");
}
