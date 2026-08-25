// Helpers for per-project ticket categories (v6). See Category in
// prisma/schema.prisma — same shape/pattern as CustomField (src/lib/customFields.ts).
// `key` is what's actually stored on Ticket.category, unchanged from before;
// what changed is that the SET of valid keys is now per-project instead of
// a single global list.

import { slugifyKey } from "./customFields";

// Derives a Ticket.category-compatible key from a label, reusing the exact
// same slug derivation CustomField.key already uses (slugifyKey above) —
// per the spec, categories follow the same shape/pattern as custom fields
// rather than inventing a parallel implementation. The result is converted
// to SCREAMING_SNAKE_CASE so a freshly created category's key reads
// consistently with the seeded defaults (LOGIN_CONNECTIVITY, etc.).
export function deriveCategoryKey(label: string): string {
  const base = slugifyKey(label).toUpperCase().replace(/-/g, "_");
  // slugifyKey's own fallback for labels with no transliterable ASCII
  // characters (the common case in this Arabic-first app — most category
  // labels are pure Arabic) is prefixed "FIELD_"; swapped for "CATEGORY_"
  // here so a purely-Arabic category's fallback key doesn't read like a
  // leftover custom-field artifact.
  return base.startsWith("FIELD_") ? `CATEGORY_${base.slice("FIELD_".length)}` : base;
}

// The 6 categories every project used to share globally, before this
// became per-project. Used to seed:
//   1) the one-time data migration backfill for projects that already
//      existed (prisma/migrations/20260817082510_add_categories_and_sla —
//      hardcoded there too since migration SQL can't import TS), and
//   2) every NEW project going forward (createProjectAction) and the seed
//      script (prisma/seed.ts), so a project's public ticket form always
//      has a sensible starting point instead of an empty list that would
//      need manual setup before /{slug}/tickets/new even works.
export const DEFAULT_CATEGORIES: { key: string; label: string }[] = [
  { key: "LOGIN_CONNECTIVITY", label: "الدخول والاتصال" },
  { key: "ROUTES_PATROLS", label: "المسارات والدوريات" },
  { key: "RECORDS_DATES", label: "السجلات والتواريخ" },
  { key: "PHOTOS_ATTACHMENTS", label: "الصور والمرفقات" },
  { key: "PERFORMANCE", label: "الأداء" },
  { key: "OTHER", label: "أخرى" },
];

export type CategoryOption = { key: string; label: string };

// Resolves a category key to its label given this project's own category
// list, falling back to the raw key if it doesn't match any (e.g. an old
// ticket referencing a category that's since been renamed — keys are
// immutable after creation, same as CustomField.key, so this shouldn't
// normally happen, but display code should never crash on it).
export function categoryLabel(categories: CategoryOption[], key: string): string {
  return categories.find((c) => c.key === key)?.label ?? key;
}
