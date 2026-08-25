// Central app configuration / constants.
//
// NOTE: this is a multi-project platform now. Per-project branding (name,
// accent color, FAQ URL, ticket prefix) lives on the `Project` row in the
// database, not here — see src/lib/projects.ts for the helpers that resolve
// a Project by slug. The old single-project `FAQ_URL`/`APP_NAME` constants
// have been retired in favor of that.

export const APP_BASE_URL =
  process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";

export const PRIORITY_LABELS: Record<string, string> = {
  LOW: "منخفضة",
  MEDIUM: "متوسطة",
  HIGH: "عالية",
  URGENT: "عاجلة",
};

export const STATUS_LABELS: Record<string, string> = {
  NEW: "جديدة",
  OPEN: "قيد المعالجة",
  PENDING: "بانتظار الرد",
  RESOLVED: "تم الحل",
  CLOSED: "مغلقة",
};

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "مدير عام",
  ADMIN: "مدير",
  AGENT: "موظف دعم",
  CUSTOM: "دور مخصص",
};

// The 4 independently-toggleable CustomRole permissions (v3). See
// src/lib/access.ts (EffectivePermissions) and the /dashboard/roles page.
export const PERMISSION_LABELS: Record<string, string> = {
  canManageTeam: "إدارة فريق المشروع",
  canManageTicketForm: "إدارة نموذج التذكرة (بما فيه الحقول المخصصة)",
  canViewReports: "عرض التقارير",
  canManageCannedResponses: "إدارة الردود الجاهزة",
};

export const CUSTOM_FIELD_TYPE_LABELS: Record<string, string> = {
  TEXT: "نص قصير",
  TEXTAREA: "نص طويل",
  NUMBER: "رقم",
  DATE: "تاريخ",
  SELECT: "قائمة اختيار",
  CHECKBOX: "مربع اختيار",
};

export const CUSTOM_FIELD_TYPES = ["TEXT", "TEXTAREA", "NUMBER", "DATE", "SELECT", "CHECKBOX"] as const;

// Per-project ticket-form field configuration modes.
export const FIELD_MODE_LABELS: Record<string, string> = {
  REQUIRED: "إلزامي",
  OPTIONAL: "اختياري",
  HIDDEN: "مخفي",
};

export const FULL_FIELD_MODES = ["REQUIRED", "OPTIONAL", "HIDDEN"] as const;
export const RESTRICTED_FIELD_MODES = ["REQUIRED", "OPTIONAL"] as const;

export const MAX_UPLOAD_SIZE_BYTES = 8 * 1024 * 1024; // 8MB

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];
