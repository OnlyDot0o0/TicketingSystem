// Helpers for per-project custom ticket-form fields (v3). See CustomField /
// TicketFieldValue in prisma/schema.prisma.

export type CustomFieldType = "TEXT" | "TEXTAREA" | "NUMBER" | "DATE" | "SELECT" | "CHECKBOX";

export const CUSTOM_FIELD_TYPES: CustomFieldType[] = [
  "TEXT",
  "TEXTAREA",
  "NUMBER",
  "DATE",
  "SELECT",
  "CHECKBOX",
];

export function isValidFieldType(v: string): v is CustomFieldType {
  return (CUSTOM_FIELD_TYPES as string[]).includes(v);
}

// Derives a url/db-safe slug key from a (possibly Arabic) label. Falls back
// to a short random suffix if the label has no ASCII-transliterable
// characters at all (e.g. a purely Arabic label), since `key` must be
// unique-per-project and non-empty.
export function slugifyKey(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (base) return base.slice(0, 60);
  return `field-${Math.random().toString(36).slice(2, 8)}`;
}

export function parseOptions(options: string | null | undefined): string[] {
  if (!options) return [];
  try {
    const parsed = JSON.parse(options);
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  } catch {
    // ignore
  }
  return [];
}

export function serializeOptions(options: string[]): string {
  return JSON.stringify(options.map((o) => o.trim()).filter(Boolean));
}

// Server-side validation for one submitted value against its CustomField
// definition. Returns an error message (Arabic, user-facing) or null if
// valid. Mirrors the pattern already used for the built-in
// REQUIRED/OPTIONAL/HIDDEN field modes in createTicketAction — never trust
// client-side enforcement alone.
export function validateCustomFieldValue(
  field: { label: string; fieldType: string; required: boolean; options: string | null },
  rawValue: string
): string | null {
  const value = rawValue.trim();

  if (field.fieldType === "CHECKBOX") {
    // Checkbox is never "empty" in a way that blocks required — an unchecked
    // required checkbox is a valid (if unusual) case; we don't force it on.
    return null;
  }

  if (field.required && !value) {
    return `الحقل "${field.label}" مطلوب.`;
  }

  if (!value) return null; // optional and blank — fine

  if (field.fieldType === "NUMBER" && Number.isNaN(Number(value))) {
    return `الحقل "${field.label}" يجب أن يكون رقمًا.`;
  }

  if (field.fieldType === "DATE" && Number.isNaN(Date.parse(value))) {
    return `الحقل "${field.label}" يجب أن يكون تاريخًا صالحًا.`;
  }

  if (field.fieldType === "SELECT") {
    const options = parseOptions(field.options);
    if (!options.includes(value)) {
      return `قيمة غير صالحة للحقل "${field.label}".`;
    }
  }

  return null;
}
