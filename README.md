# مساعدة الدعم الفني — نظام تذاكر متعدد المشاريع (Multi-Project Helpdesk)

A production-grade, Arabic-first (RTL) ticketing/helpdesk web app. It started
as a single-tenant tool for **رقابة+** (RAQABA+), was refactored into a
**multi-project platform** (v1), and has now been extended (v2) with
**project-scoped access control**, per-project ticket-form configuration,
canned responses, tags, an activity/audit log, and several security
hardening features (honeypot, rate limiting, optional CAPTCHA, self-service
password reset). Later rounds added custom roles and custom ticket-form
fields (v3), CSAT/bulk actions/CSV export (v4), a hardening pass (v5), and
most recently (v6) **per-project ticket categories and per-project SLA
timings**, closing out the last two pieces of ticket-form configuration
that used to be global.

## Multi-project architecture

- **Isolation model**: one shared Next.js app, one shared SQLite/Postgres
  database. A `Project` row (id, slug, name, accentColorHex, faqUrl,
  ticketPrefix, ticketSeq, + ticket-form field-mode columns — see below)
  represents each client. Every `Ticket` belongs to exactly one `Project`
  (`Ticket.projectId`), and all public-facing pages are scoped by project
  via the URL.
- **Per-project customization**: branding (name, accent color, FAQ URL,
  ticket prefix), the ticket-form field configuration, and — as of v6 —
  ticket **categories** and **SLA-by-priority timings** too (see "Per-project
  ticket categories" and "Per-project SLA timings" below). Nothing about a
  project's configuration is global/shared anymore.
- **Ticket numbering is per-project**: each `Project` has its own `ticketSeq`
  counter, incremented transactionally (`{ increment: 1 }` in the same
  `project.update()` call that reads the new value back), so numbers like
  `RQ-000123` / `DEMO-000045` never collide or race across projects.

### URL scheme

| URL | What it is |
|---|---|
| `/` | Project directory / picker — lists all active projects, links into each |
| `/{slug}` | Project landing page (branded) |
| `/{slug}/tickets/new` | Open a new ticket, scoped to that project, respecting its ticket-form config |
| `/{slug}/tickets/track` | Track/reply to a ticket, scoped to that project |
| `/tickets/new`, `/tickets/track` | **Legacy redirects** → `/raqaba/tickets/...` |
| `/forgot-password`, `/reset-password` | Agent/admin self-service password reset |
| `/dashboard` | Ticket queue — scoped to the viewer's project membership (see below); now with row checkboxes/bulk actions, CSV export, and a "my tickets" quick filter (v4) |
| `/dashboard/export.csv` | CSV export of the **currently filtered** ticket queue (v4) — same scoping/filters as `/dashboard` |
| `/dashboard/tickets/[id]` | Ticket detail — reply, controls, tags, canned responses, activity log, CSAT rating (v4) |
| `/dashboard/reports` | `ADMIN`/`SUPER_ADMIN` — scoped reports, incl. average CSAT (v4) |
| `/dashboard/agents` | `ADMIN`/`SUPER_ADMIN` — scoped team management |
| `/dashboard/canned-responses` | `ADMIN`/`SUPER_ADMIN` — manage reusable reply templates |
| `/dashboard/projects` | `SUPER_ADMIN`: create/edit any project. `ADMIN`: read-only list of their own project(s) |
| `/dashboard/projects/[id]` | Project detail: ticket-form config (SUPER_ADMIN + project ADMIN) + team members (SUPER_ADMIN only) |
| `/dashboard/change-password` | (v5) Forced first-login password change for admin-created accounts — see "Hardening pass" below |
| `/dashboard/settings` | (v5) Any logged-in staff account — self-service TOTP 2FA enrollment/disable |
| `/dashboard/audit` | (v5) `SUPER_ADMIN`-only — the admin activity log |
| `/csat/[ticketId]` | Public, unauthenticated one-click CSAT rating landing page (v4) — linked from the "resolved" notification email |

A slug that doesn't match any `Project` row 404s (via `getProjectBySlugOr404`
in `src/lib/projects.ts`).

## Access control (v2 — project-scoped)

This is the core change in this round. A new `ProjectMembership` join table
(`userId`, `projectId`, unique on the pair) now gates what `ADMIN`/`AGENT`
accounts can see:

- **`SUPER_ADMIN`** stays fully global — sees/manages every project, every
  ticket, every user, completely unaffected by `ProjectMembership`.
- **`ADMIN`** and **`AGENT`** now **require at least one `ProjectMembership`
  row** to see anything. Every dashboard view (ticket queue, ticket detail,
  reports, agents list, canned responses, tags) is scoped to only the
  project(s) they're a member of. An account with zero memberships gets a
  404 on dashboard pages (see `requireScopedViewer` in `src/lib/access.ts`)
  — this is a provisioning issue, not a broken link, but we render the same
  "not found" the app already uses elsewhere for consistency, rather than
  mixing in a separate 403 page.
- Direct-URL access to a ticket or project **outside** the viewer's
  membership 404s too (`src/app/dashboard/tickets/[id]/page.tsx` and
  `src/app/dashboard/projects/[id]/page.tsx` both check
  `canAccessProject()` before rendering anything).
- **`ADMIN` is effectively a "project admin"**: within their assigned
  project(s) they can:
  - manage that project's team — create/invite new `AGENT`/`ADMIN` accounts
    from `/dashboard/agents` and assign them to any of the **inviting
    ADMIN's own** projects (never a project the ADMIN itself isn't a member
    of, and never `SUPER_ADMIN`);
  - manage that project's ticket-form field configuration (see below) from
    `/dashboard/projects/[id]`;
  - see that project's reports and canned responses.
- **`SUPER_ADMIN` manages project membership** from the project edit page
  (`/dashboard/projects/[id]`) — a "فريق المشروع" (team) section lists
  current members with their role, lets you add any existing active user,
  and remove a member. This section is `SUPER_ADMIN`-only; an `ADMIN`
  viewing their own project sees a read-only member list and is pointed to
  `/dashboard/agents` to invite new accounts instead.
- `SUPER_ADMIN` still creates brand-new projects and users the same as v1.

`src/lib/access.ts` centralizes this: `getViewerScope()` resolves the
current session into `{ isSuperAdmin, projectIds }`, and
`requireScopedViewer()` / `requireProjectAccess()` / `scopedProjectWhere()`
are used throughout the dashboard route handlers and server actions so the
same scoping rule can't be bypassed by hitting a server action directly.

### Seed data / membership migration

- `admin@raqaba.local` stays `SUPER_ADMIN` — bypasses scoping, no membership
  rows needed.
- `agent@raqaba.local` already had ticket assignments in **both** the
  `raqaba` and `demo` seeded projects, so it was given `ProjectMembership`
  rows for both — those existing assignments stay valid under the new model
  instead of being silently orphaned.
- `testadmin@raqaba.local` — a leftover demonstration `ADMIN` account from
  an earlier verification round — was repurposed as the project-scoping
  demo: membership on **`demo` only**, so you can verify it cannot see
  `raqaba` (or `acme`) tickets/reports/team at all. Its password was reset
  to a known value (`TestAdmin123!`, see table below) since the original
  wasn't recorded anywhere.
- A third project, `acme` (slug `acme`, also a leftover from prior
  verification), was folded into `prisma/seed.ts` as a proper seeded
  project so `npx prisma migrate reset && npm run prisma:seed` reproduces
  the same three-project, three-account demo state from scratch.

## Per-project ticket-form field configuration

Not a full dynamic form builder — a fixed, small set of togglable built-in
fields, each configurable per project as one of `REQUIRED` / `OPTIONAL` /
`HIDDEN` (modeled as plain string columns directly on `Project` —
`emailMode`, `contractNumberMode`, `attachmentsMode` — rather than a
separate table, since the field set is fixed and small):

- **البريد الإلكتروني (email), رقم العقد (contract number), المرفقات
  (attachments)**: `REQUIRED` / `OPTIONAL` / `HIDDEN`.
- **التصنيف (category), الأولوية (priority)**: `REQUIRED` / `OPTIONAL`
  **only** — no `HIDDEN`, because they drive routing/SLA. If a project sets
  either to `OPTIONAL` and the submitter leaves it blank, the server
  applies a default: category → `OTHER`, priority → `MEDIUM`. This default
  is applied **server-side** in `createTicketAction`
  (`src/app/[slug]/tickets/new/actions.ts`), never just assumed client-side.
- **الاسم، الجوال، العنوان، الوصف (name, phone, subject, description)**
  remain always required and are **not** configurable — they're load-bearing
  for identifying the submitter and knowing what's wrong.
- Every existing/new project defaults to today's v1 behavior (email =
  OPTIONAL, contractNumber = OPTIONAL, category = REQUIRED, priority =
  REQUIRED, attachments = OPTIONAL) via schema column defaults, so nothing
  changes for `raqaba`/`demo`/`acme` unless someone edits it.

UI: a "نموذج التذكرة" (ticket form) section on
`/dashboard/projects/[id]`, editable by `SUPER_ADMIN` (any project) and
`ADMIN` (their own project(s)). The public `/{slug}/tickets/new` form
(`NewTicketForm.tsx`) reads this config from the `Project` row and
dynamically shows/hides/requires fields — **and the server independently
re-validates every field mode** in `createTicketAction`, so a spoofed
client-side field (e.g. re-adding a `HIDDEN` field via devtools) is
silently ignored, never trusted. This was verified directly (see
"Verification performed" below).

## New helpdesk features (all project-scoped)

- **Canned responses** (`CannedResponse` model: projectId, title, body,
  createdBy, createdAt) — managed from `/dashboard/canned-responses` by
  `ADMIN`/`SUPER_ADMIN` for projects they have access to. Any
  `AGENT`/`ADMIN` with access to a ticket's project sees a picker in the
  reply box on the ticket detail page (`AgentReplyForm.tsx`) that inserts
  the canned response's body into the reply textarea — still fully
  editable before sending, never auto-sent.
- **Tags** (`Tag` model, projectId/name/colorHex, unique per project;
  `TicketTag` join table, many-to-many with `Ticket`) — on the ticket
  detail page (`TagsSection.tsx`) you can add an existing project tag, type
  a new one inline (with an optional hex color), or remove a tag. The
  ticket queue (`/dashboard`) has a tag filter dropdown alongside the
  existing status/category/priority/project/agent filters.
- **Activity/audit log** (`TicketActivity` model: ticketId, actorName,
  action, fromValue, toValue, createdAt) — auto-logged whenever status,
  priority, category, or assignment changes (including the automatic
  "reply nudges status to PENDING" transition), and whenever a tag is
  added/removed. **Design choice**: shown as a **separate "سجل النشاط"
  (activity timeline) section** in the right-hand sidebar of the ticket
  detail page (`ActivityTimeline.tsx`), rather than interleaved
  chronologically into the message thread — the message thread is
  submitter-facing conversation history, while the activity log is
  internal bookkeeping; mixing the two made the conversation harder to
  read in testing, so they're kept visually distinct even though both are
  time-ordered.

### Roles (unchanged role hierarchy, now project-scoped)

| Role | Can do |
|---|---|
| `SUPER_ADMIN` | Everything, globally, unaffected by `ProjectMembership`: all projects, all tickets, all users, project membership management |
| `ADMIN` | Everything `AGENT` can, within their project(s), **plus**: manage that project's team (invite `AGENT`/`ADMIN`, only into their own projects), manage that project's ticket-form config, see that project's reports, manage that project's canned responses |
| `AGENT` | Work tickets (reply, reassign, change status/priority/category, tag) within their project(s) only |

## Custom roles (v3)

`SUPER_ADMIN`-only. A `CustomRole` is a **named variant of `ADMIN` or
`AGENT`** ("`baseRole`") with a small, fixed set of **4 independently
toggleable extra permissions** layered on top — intentionally **not** a
full ground-up permissions matrix:

| Toggle | Gates |
|---|---|
| `canManageTeam` | `/dashboard/agents` — invite/remove project team members, assign non-`SUPER_ADMIN` roles (including other custom roles) |
| `canManageTicketForm` | The ticket-form config section on `/dashboard/projects/[id]` — both the built-in `REQUIRED`/`OPTIONAL`/`HIDDEN` field modes **and** the custom-field definitions (add/edit/reorder/delete) described below |
| `canViewReports` | `/dashboard/reports` |
| `canManageCannedResponses` | Create/edit canned responses on `/dashboard/canned-responses` (using an existing one in a reply stays available to **every** project member regardless of role — unaffected by this toggle) |

A `User` whose `role` column is the literal string `"CUSTOM"` is linked to
exactly one `CustomRole` via the nullable `customRoleId` FK; their
effective permissions resolve through that row instead of the built-in
role table. Baseline ticket-working behavior — viewing the queue/ticket
detail within assigned projects, replying, changing
status/priority/category, assigning tickets, adding/creating tags, and
editing custom-field **values** on a ticket — is **not** gated by any of
the 4 toggles and is identical for every project member, exactly as
before.

Custom roles are **always project-scoped exactly like `ADMIN`/`AGENT`
today** — a custom-role user still needs a `ProjectMembership` row per
project and never bypasses it. There is deliberately no "make this role
global" option; only `SUPER_ADMIN` itself is ever unscoped.

Built-in `ADMIN` behaves as if all 4 toggles are permanently `true`,
built-in `AGENT` as if all 4 are permanently `false` — this is computed in
`permissionsForBaseRole()` in `src/lib/access.ts`, not stored anywhere, so
it can't drift out of sync with a real `CustomRole` row. `getViewerScope()`
now returns a `permissions: EffectivePermissions` object on every
`ViewerScope`, and every one of the four gated pages/actions
(`/dashboard/agents`, `/dashboard/reports`, `/dashboard/canned-responses`,
`/dashboard/projects` + `/dashboard/projects/[id]`, and their
corresponding server actions) checks `scope.isSuperAdmin ||
scope.permissions.<toggle>` instead of the old `role === "ADMIN"` string
comparison.

UI:
- **`/dashboard/roles`** (`SUPER_ADMIN`-only, linked from the dashboard nav
  as "الأدوار المخصصة"): list existing custom roles with their toggle
  state and assigned-user count, create a new one (name, base-role
  selector, the 4 toggles), edit an existing one in place. Choosing a base
  role in the **create** form pre-checks each toggle to match that base
  role's default (`ADMIN` → all 4 checked, `AGENT` → all 4 unchecked) as a
  starting point — every toggle stays independently overridable via its
  checkbox before submitting, in either direction (e.g. an `AGENT`-based
  role with only `canManageCannedResponses` on, or an `ADMIN`-based one
  with `canManageTeam` off — both were exercised live, see "Verification
  performed").
  - **Deletion is blocked** (not reassigned) while any user is still
    assigned that role — `deleteCustomRoleAction` returns an error naming
    the number of affected accounts instead of silently moving them to a
    different role. Reassigning automatically would change someone's
    effective permissions as a side effect of an unrelated cleanup click,
    which felt like the more surprising and riskier default; the admin
    must first re-role affected accounts from `/dashboard/agents`, then
    delete.
- **`/dashboard/agents`**'s role picker (`CreateAgentForm`, `AgentRow`) now
  lists custom roles alongside the 3 built-ins, grouped under an
  "أدوار مخصصة" `<optgroup>`. The `<select>` value for a custom role is
  encoded as `CUSTOM:<customRoleId>` and decoded server-side in
  `agents/actions.ts` (`decodeRoleSelection`) into `{ role: "CUSTOM",
  customRoleId }` before writing to `User`. The existing privilege rule
  stays symmetric and is now permission-based rather than role-based:
  anyone with `canManageTeam` (built-in `ADMIN`, or a custom role with
  that toggle on) can assign `ADMIN`/`AGENT`/any custom role to a
  teammate, but can never grant `SUPER_ADMIN` — only `SUPER_ADMIN` itself
  can, and only `SUPER_ADMIN` can create/edit `CustomRole` definitions
  themselves.

## Custom ticket-form fields (v3, per project)

Extends the existing built-in field-mode config with genuinely custom,
project-defined fields — `CustomField` (id, projectId, `key` — a
url/db-safe slug derived from `label`, unique per project, `label`,
`fieldType`: `TEXT` / `TEXTAREA` / `NUMBER` / `DATE` / `SELECT` /
`CHECKBOX`, `required`, `options` — JSON string array, only meaningful for
`SELECT`, `order`) and `TicketFieldValue` (ticketId, customFieldId,
`value` — **always stored as a string**, cast/formatted per `fieldType`
only at the UI layer, unique on `(ticketId, customFieldId)`).

- **Public form** (`/{slug}/tickets/new`): after the built-in fields, this
  project's custom fields render in `order` with the input matching
  `fieldType` (`SELECT` renders its `options` as a `<select>`). **Verified
  live**: `raqaba` and `demo` each only show their own seeded custom
  field, never the other project's.
- **Server-side re-validation** (`validateCustomFieldValue()` in
  `src/lib/customFields.ts`, called from `createTicketAction`) mirrors the
  existing pattern used for the built-in `REQUIRED`/`OPTIONAL`/`HIDDEN`
  field modes — every custom field is re-checked against the DB
  definition on submit, regardless of what the client sent. **Verified
  live** by stripping the `required` attribute and blanking the field via
  devtools/JS before submitting `raqaba`'s required `SELECT` field
  ("نوع الأصل"): the server rejected it with `الحقل "نوع الأصل" مطلوب.`
  and created no ticket; filling it in and resubmitting succeeded
  (`RQ-000007`).
- **Ticket detail page** (`/dashboard/tickets/[id]`): a "بيانات إضافية"
  (extra info) card shows each custom field's current value, with an
  inline "تعديل" (edit) control per field (`CustomFieldsSection.tsx`).
  Per the spec, these values are a **baseline ticket-editing action**
  available to **any** project member regardless of role/toggles — same
  `requireTicketAccess()` gate as replying/tagging/reassigning, **not**
  gated by `canManageTicketForm` (that toggle gates the field
  *definitions* on the project page, not per-ticket *values*). Verified
  live: edited `RQ-000007`'s "نوع الأصل" from مركبة → معدات → مبنى,
  each change persisted and the inline editor auto-closes back to the
  read view on a successful save.
- **Field management UI**: a new "حقول مخصصة" card on
  `/dashboard/projects/[id]` (`CustomFieldsManager.tsx`), gated by
  `canManageTicketForm` — same gate as the existing built-in field-mode
  controls on that page. Supports add (label, type, required, newline-
  separated options for `SELECT`), inline edit, delete (with a confirm
  dialog warning that existing values are lost), and reorder via
  adjacent-swap ↑/↓ buttons (`moveCustomFieldAction`) — deliberately not
  drag-and-drop, since the field lists this targets are small and
  hand-managed.
  - **`fieldType` and `key` are not editable after creation** — both
    control how already-submitted `TicketFieldValue` rows must be
    interpreted, and changing them out from under historical data would
    silently corrupt or mis-render it. Delete and re-create instead if a
    field's type needs to change.
  - `key` is derived from `label` via `slugifyKey()` (ASCII
    transliteration + dashes; falls back to a random `field-xxxxxx` slug
    if the label has no transliterable characters, e.g. a purely Arabic
    label) and de-duplicated with a numeric suffix if it collides within
    the same project.

## Per-project ticket categories (v6)

Replaces the old hardcoded global category list (`LOGIN_CONNECTIVITY` /
`ROUTES_PATROLS` / `RECORDS_DATES` / `PHOTOS_ATTACHMENTS` / `PERFORMANCE` /
`OTHER`) with a real `Category` model — **same shape/pattern as
`CustomField`**: `id`, `projectId`, `key`, `label`, `order`, `createdAt`,
unique on `(projectId, key)`. `Ticket.category` keeps storing a plain string
key exactly as before (no schema change to `Ticket` itself) — what changed
is that the SET of valid keys is now per-project instead of a single global
list.

- **Migration for existing data**: the schema migration
  (`prisma/migrations/20260817082510_add_categories_and_sla`) includes a
  hand-written backfill `INSERT ... SELECT ... FROM "Project"` that seeds
  every project that already existed at migration time with the same 6
  default categories, using the **exact same key strings** every existing
  `Ticket.category` value already stored — so nothing became orphaned.
  Verified directly against this app's real dev.db (see "Verification
  performed (v6)" below): all pre-existing tickets across `raqaba`, `demo`,
  and `acme` (plus a leftover `audittest` project from an earlier
  verification round) still resolved to a real category with zero orphans.
- **New projects**: `createProjectAction` seeds the same default 6-category
  set (`DEFAULT_CATEGORIES` in `src/lib/categories.ts`) on creation, fully
  editable afterward — the public ticket form works immediately instead of
  requiring manual category setup first. `prisma/seed.ts` does the same
  (idempotent `upsert`) for `raqaba`/`demo`/`acme` so a fresh
  `migrate reset && seed` reproduces the same category keys the sample
  tickets already reference.
- **Management UI**: a new "تصنيفات التذاكر" card on
  `/dashboard/projects/[id]` (`CategoriesManager.tsx`), gated by
  `canManageTicketForm` — same gate, same add/edit/reorder(↑/↓)/delete
  pattern as the existing custom-fields card right above it. `key` is
  derived from `label` via `deriveCategoryKey()` (`src/lib/categories.ts`),
  which reuses `CustomField`'s `slugifyKey()` and converts it to
  `SCREAMING_SNAKE_CASE` so a freshly created category's key reads
  consistently with the seeded defaults (e.g. `LOGIN_CONNECTIVITY`). Like
  `CustomField.key`, `key` is **not editable after creation** — only
  `label` and `order` are.
  - **Deleting a category currently referenced by any ticket is blocked**,
    with an error naming how many tickets are affected — same precedent as
    `deleteCustomRoleAction` blocking deletion of an in-use `CustomRole`.
  - **Deleting a project's last remaining category is also blocked.**
    `Ticket.category` is a non-nullable column, so a project with zero
    categories could never again produce a valid ticket (an empty dropdown
    on the public form, and no default left to fall back to when
    `categoryMode` is `OPTIONAL`). Not explicitly asked for, but a direct
    consequence of the non-nullable column — surfaced as a clear error
    rather than letting a project accidentally break its own public form.
- **Public ticket form** (`/{slug}/tickets/new`): the category dropdown now
  sources from the project's own `Category` list instead of a hardcoded
  array. **Server-side re-validation in `createTicketAction`** re-fetches
  this project's actual categories and checks the submitted key against
  those — never the old global array — so a spoofed category value (e.g.
  injected via devtools) is rejected with "تصنيف غير صالح." and no ticket
  is created. **Verified live** (see below).
  - There's no longer a single global `"OTHER"` to fall back to when
    `categoryMode` is `OPTIONAL` and left blank — the server instead
    defaults to the project's own first category by `order`. This is a
    deliberate judgment call: previously "leave category blank → OTHER"
    was unambiguous because `OTHER` was a fixed global key; now that
    categories are per-project and fully renameable/reorderable, "the
    project's first category" is the closest equivalent "default choice"
    without inventing a new "is this the fallback" flag on `Category`.
- **Reports page** (`/dashboard/reports`): the "التذاكر حسب التصنيف" (by
  category) breakdown now sources the active project's own `Category` list
  instead of the old global `CATEGORY_LABELS` object.
  - **When a specific project is selected** (or the viewer only has access
    to exactly one project), the chart renders exactly as before, just
    sourced per-project.
  - **When viewing multiple/all projects at once** (`SUPER_ADMIN`, or an
    `ADMIN` with more than one project membership, with no `projectId`
    filter applied), the chart is **not rendered** — a short note tells the
    viewer to pick a specific project instead. **Deliberate judgment
    call**: different projects' categories can use unrelated (or
    coincidentally colliding) keys now that the list isn't global, so there
    is no single meaningful axis left to chart tickets from multiple
    projects on at once. Grouping by the raw stored key (the other option
    the spec allowed for) was considered and rejected — it would render a
    non-Arabic, DB-internal-looking key like `LOGIN_CONNECTIVITY` right
    next to a human label like "اختبار QA" from a different project's
    similarly-shaped-but-different category, which reads as more confusing
    than a chart that isn't shown at all. The other three charts (status,
    CSAT, 30-day time series) are unaffected and still render for the
    all-projects view, since status/CSAT/time are genuinely global axes.
  - The ticket-queue category **filter** dropdown (`/dashboard`) has the
    same underlying limitation: when a single project is already selected
    it lists just that project's categories, but when viewing multiple/all
    projects it groups categories under an `<optgroup>` per project (so the
    picked value is still an unambiguous, specific project's category key)
    rather than hiding the filter entirely — filtering by category was
    judged useful enough even across projects to keep, unlike the reports
    chart, since picking one option from a grouped list is a much smaller
    ask of the viewer than reading an aggregated chart correctly.
- **Straggler global-map references cleaned up**: `CATEGORY_LABELS` in
  `src/lib/config.ts` has been removed entirely. Every place that used to
  read from it now resolves a label from the relevant project's own
  `Category` list instead (falling back to the raw stored key if a lookup
  ever misses, same graceful-degradation spirit as the old
  `CATEGORY_LABELS[x] ?? x`): the ticket queue table and CSV export (both
  now preload a `{projectId}:{key} -> label` map scoped to every project the
  viewer can access), the ticket detail page, the public ticket-tracking
  page, the ticket-detail category `<select>` (`TicketControls.tsx`), and
  the `CATEGORY_CHANGED` activity-log entry (`updateTicketAction` now
  re-validates the submitted category against the ticket's own project
  before applying it or logging the change — the same spoof-rejection
  discipline as every other field on that action).

## Per-project SLA timings (v6)

Replaces the fixed global SLA-by-priority timings in `src/lib/sla.ts`
(`URGENT` = 4h, `HIGH`/`MEDIUM`/`LOW` = 1/3/5 business days) with four
plain columns directly on `Project`: `slaUrgentHours`, `slaHighDays`,
`slaMediumDays`, `slaLowDays` — same reasoning as the existing field-mode
columns (`emailMode` etc.): a small, fixed set of numbers, not worth a
separate table. Column defaults (`4`/`1`/`3`/`5`) exactly match the old
global constants, so every existing project keeps today's exact SLA
behavior unless someone explicitly edits it.

- `computeSlaDueAt()` (`src/lib/sla.ts`) now takes an `SlaConfig` object
  (the 4 fields above) instead of reading hardcoded constants. The only
  call site in the app, `createTicketAction`
  (`src/app/[slug]/tickets/new/actions.ts`), threads the ticket's own
  project's config through when computing a new ticket's `slaDueAt` — there
  is no other place in the codebase that (re)computes an SLA due date
  (confirmed by search), so there was nothing else to update.
- **Management UI**: a new "مهلة الاستجابة (SLA)" card on
  `/dashboard/projects/[id]` (`SlaConfigForm.tsx`), same
  `canManageTicketForm` gate, with 4 number inputs (min `1`, integer). Saved
  by `updateSlaConfigAction`, which rejects non-positive/non-integer values
  server-side (never trusts the `min`/`type="number"` HTML attributes
  alone) and logs a `PROJECT_SLA_UPDATED` `AdminActivity` entry, same
  pattern as the ticket-form-config save right above it.

## Verification performed (v6 — per-project categories + SLA)

- `npx prisma migrate dev` (new migration `add_categories_and_sla`, with a
  hand-written data-migration backfill — see "Per-project ticket
  categories" above), `npx tsc --noEmit`, and `npm run build` (fresh
  `.next`) all run clean.
- **Migration backfill, verified directly against this app's real dev.db**
  (not a fresh reset): every project that already existed (`raqaba`,
  `demo`, `acme`, plus a leftover `audittest` project) got exactly the same
  6 default categories with the exact same key strings tickets already
  used; a direct query over every ticket confirmed **zero** tickets whose
  `category` value didn't resolve to a real `Category` row in its own
  project.
- Manually exercised end-to-end in a real browser against the dev server
  (logged in as `admin@raqaba.local`, `SUPER_ADMIN`, unless noted):
  - Added a new category ("اختبار QA", auto-derived key `QA`) to `raqaba`
    from `/dashboard/projects/[id]`; confirmed it immediately appeared in
    `raqaba`'s public form dropdown (`/raqaba/tickets/new`) and **did not**
    appear on `demo`'s form (`/demo/tickets/new`) — confirmed by reading
    each form's actual `<select>` options.
  - Spoofed an invalid category value on `raqaba`'s public form (injected a
    bogus `<option>` via devtools/JS, selected it, force-submitted) —
    server rejected with "تصنيف غير صالح." and created no ticket (confirmed
    by querying the DB for the submitted subject afterward — no row).
    Submitting the same form with the legitimate new "اختبار QA" category
    afterward succeeded normally (`RQ-000008`).
  - Attempted to delete the "اختبار QA" category while `RQ-000008` still
    referenced it — blocked with "لا يمكن حذف هذا التصنيف — هناك 1
    تذكرة(تذاكر) لا تزال مصنّفة به."; created and then deleted a second,
    unused throwaway category ("مؤقت للحذف") — succeeded immediately.
  - Changed `raqaba`'s `slaUrgentHours` from `4` to `1`, created a new
    `URGENT` ticket on `raqaba` (`RQ-000009`) and confirmed its `slaDueAt`
    was exactly 1 hour after `createdAt` (queried directly from the DB);
    created a new `URGENT` ticket on `demo` (`DEMO-000003`) in the same
    session and confirmed its `slaDueAt` was still the unchanged 4-hour
    default — the two projects' SLA configs are independent. Reverted
    `raqaba`'s value back to `4` afterward to match the documented seed
    defaults.
  - Spot-checked several pre-existing seeded tickets across `raqaba` and
    `demo` on `/dashboard` (the ticket queue) and confirmed every category
    badge still renders its correct Arabic label (not a raw key or a
    blank), including tickets whose category is one of the original 6
    defaults.
  - Changed an existing ticket's (`RQ-000001`) category from "الدخول
    والاتصال" to "اختبار QA" via `/dashboard/tickets/[id]` and confirmed
    the "سجل النشاط" (activity log) recorded "غيّر التصنيف من الدخول
    والاتصال إلى اختبار QA" with correctly-resolved labels on both sides;
    reverted it back afterward.
  - Confirmed the public "تتبع تذكرتك" (track ticket) page
    (`/raqaba/tickets/track`) also resolves the category label correctly
    for a ticket with the new custom category.
  - Fetched `/dashboard/export.csv?projectId=<raqaba>` directly and
    confirmed the "التصنيف" column shows resolved Arabic labels (including
    "اختبار QA") rather than raw keys, with the UTF-8 BOM still intact.
  - `/dashboard/reports`: with no project filter (`SUPER_ADMIN`, multiple
    projects in scope) the category chart correctly shows the "select a
    project" note instead of rendering; selecting `raqaba` specifically
    switched it to a real per-category bar chart sourced from `raqaba`'s
    own categories.
  - Created a brand-new project (`qacheck`) through
    `/dashboard/projects` and confirmed it was seeded with the same default
    6 categories and default SLA columns (`4`/`1`/`3`/`5`), and that its
    public form (`/qacheck/tickets/new`) worked immediately with those
    categories with zero manual setup.

## Deviations / judgment calls (v6)

- **Reports "all projects" category chart**: not rendered when multiple/all
  projects are in view (see "Per-project ticket categories" above for the
  full reasoning) — the spec explicitly allowed either this or a
  raw-key grouping, and this was judged the less confusing option.
- **OPTIONAL category fallback**: defaults to the project's first category
  by `order` (instead of a fixed `"OTHER"` key, which no longer universally
  exists) when `categoryMode` is `OPTIONAL` and left blank.
- **Deleting a project's last category is blocked**, in addition to the
  explicitly-requested "blocked while in use by a ticket" rule — a direct
  consequence of `Ticket.category` staying non-nullable.
- **Category `key` derivation reuses `CustomField`'s `slugifyKey()`**
  (converted to `SCREAMING_SNAKE_CASE`) rather than a parallel
  implementation, per the instruction that categories should follow the
  exact same shape/pattern as custom fields. Its fallback prefix for
  labels with no transliterable ASCII characters (common in this
  Arabic-first app) was renamed from `FIELD_` to `CATEGORY_` so a
  purely-Arabic category's generated key doesn't read like a leftover
  custom-field artifact.
- **The ticket-queue category filter groups by project (`<optgroup>`)
  rather than being hidden** when viewing multiple/all projects, unlike the
  reports chart — picking one option from a grouped list was judged a much
  smaller ask than reading an aggregated chart correctly, so the filter
  stays useful even without a single global category list.

## CSAT, bulk actions, CSV export, "my tickets" filter (v4)

Four independent additions to the ticket queue and ticket lifecycle:

### CSAT (customer satisfaction) rating

- `Ticket.satisfactionRating` (`Int?`, 1–5) and `Ticket.satisfactionSubmittedAt`
  (`DateTime?`) live directly on `Ticket` — consistent with how `resolvedAt`
  etc. are modeled, no separate table for a single value.
- When a ticket is marked `RESOLVED` (both the single-ticket
  `updateTicketAction` and the new bulk status-change action call
  `notifyResolved`), the resolved-notification email now also includes 5
  one-click star links (1★ through 5★) pointing at
  `/csat/[ticketId]?rating=N`. Ticket ids are unguessable cuids and this is
  a low-stakes action — same trust model this app already uses for
  attachment URLs (`/api/uploads/[...path]`) — so no separate signed token
  was added just for this.
- `/csat/[ticketId]` (`src/app/csat/[ticketId]/page.tsx`) is a public,
  unauthenticated route. It validates the ticket exists (404 otherwise),
  and:
  - if not yet rated and a valid `?rating=1..5` is present, records the
    rating + timestamp and shows "شكرًا لتقييمك";
  - if **already** rated, shows "تم تقييم هذه التذكرة مسبقًا بـ X/5" and
    does **not** overwrite the existing rating and does **not** error —
    informs rather than blocks, per spec;
  - if visited with no/invalid rating query param and not yet rated, shows
    the 5 star links again so the bare URL is still usable.
  - Branded with the ticket's own project (`PublicHeader`/`PublicFooter`),
    same as every other public page.
- Shown on `/dashboard/tickets/[id]` (if given) as "⭐⭐⭐⭐ (4/5)" with the
  submission timestamp, under the ticket description.
- An "متوسط تقييم الرضا" (average CSAT) stat card was added to
  `/dashboard/reports`, project-scoped like the rest of that page, showing
  `X.X/5 (N تقييم)` or "لا تقييمات بعد" if nothing's been rated yet in
  scope.

### Bulk actions on the ticket queue

- Row checkboxes + a "select all on this page" checkbox on `/dashboard`'s
  ticket table (`TicketQueueTable.tsx`, a client component the server page
  now delegates the table to).
- A bulk-action bar appears once ≥1 row is selected: bulk status change,
  bulk assign (to a specific agent, to nobody, or a one-click "إسناد لنفسي"
  self-assign), bulk add-tag — reusing the exact same status/agent/tag
  option sets already fetched for the filter bar (no separate data source).
- Server actions (`src/app/dashboard/bulk-actions.ts`) independently
  re-fetch and re-check `canAccessProject()` for **every** ticket id
  received, exactly like every other action in this app — a submitted id
  list is never trusted just because the UI only rendered checkboxes for
  tickets the viewer could see. Ids that fail the check (or, for tagging,
  belong to a different project than the tag) are silently skipped and
  counted, not applied.
- Each successful per-ticket change logs a `TicketActivity` row using the
  same action names/labels as the existing single-ticket flow in
  `src/app/dashboard/tickets/[id]/actions.ts` — the activity timeline reads
  identically whether a change came from the single-ticket page or a bulk
  operation; this is deliberately the same audit path, not a second one.
- The bar reports back e.g. "تم تحديث 4 تذكرة، تم تخطي 1 (بلا صلاحية أو
  غير قابلة للتطبيق)" and clears the selection afterward.

### CSV export of the ticket queue

- "تصدير CSV" button on `/dashboard` — exports the **currently filtered**
  result set (every active status/category/priority/project/agent/tag/
  overdue/search filter, read straight off the same query string), not
  just the current page.
- The `where`/`orderBy` construction used to be inline in
  `dashboard/page.tsx`; it's now `buildTicketQueueWhere()` /
  `buildTicketQueueOrderBy()` in `src/lib/ticketQueue.ts`, imported by
  **both** the queue page and the new export route
  (`src/app/dashboard/export.csv/route.ts`) so the two views of "the
  currently filtered set" can never drift apart.
- The export route calls the same `requireScopedViewer()` /
  `scopedProjectWhere()` (via `buildTicketQueueWhere`) as the queue page —
  identical scoping, including 404-ing a `projectId` filter the viewer
  can't access.
- Columns (Arabic headers): رقم التذكرة، المشروع، الموضوع، التصنيف،
  الأولوية، الحالة، الموظف المسؤول، اسم مقدّم الطلب، جوال مقدّم الطلب،
  تاريخ الإنشاء، موعد استحقاق SLA — ticket number, project name, subject,
  category, priority, status, assigned agent, submitter name, submitter
  phone, created date, SLA due date.
- UTF-8 with a leading BOM (U+FEFF) so Arabic text opens correctly in
  Excel — verified live (see below) by fetching the route and inspecting
  the raw bytes (`EF BB BF` followed by correctly-decoded Arabic).

### "My tickets" quick filter

- A one-click "تذاكري فقط" chip next to the queue's stats/export controls
  on `/dashboard`. It's a shortcut for the existing "الموظف المسؤول"
  filter dropdown — sets `assignedToId` to the current viewer's own id —
  and toggles back off (clearing the filter) if clicked again while
  active. Shows "✓ تذاكري فقط" (filled/primary style) when active vs.
  outline style when not, so it visually indicates state.
- All other active filters (status, project, tag, search, sort, etc.) are
  preserved when toggling it, same as picking yourself from the dropdown
  would do.

## Security hardening

- **Honeypot**: a hidden field (`name="website"`, visually and
  programmatically off-screen — `position: absolute; left: -9999px`,
  `aria-hidden`, `tabIndex={-1}`, `autoComplete="off"`) on the public
  ticket form. Real users never see or fill it; bots that blindly
  autofill every form field usually do. If it's non-empty on submit, the
  server (`createTicketAction`) silently returns with no error and no
  ticket created — no signal is given back to the bot. Zero configuration,
  always active.
- **Rate limiting** on public ticket creation
  (`src/lib/rateLimit.ts`): **max 5 submissions per phone number per hour**
  and **max 10 per IP per hour** (IP read from `x-forwarded-for`/`x-real-ip`
  via `next/headers`). Implemented as a simple in-memory, fixed-window
  counter — correct and sufficient for this single-instance deployment. **A
  real production/multi-instance deploy behind a load balancer should swap
  this for a shared store (e.g. Redis `INCR`+`EXPIRE`)**, since an
  in-process `Map` doesn't coordinate across instances.
- **Optional CAPTCHA** (`src/lib/captcha.ts`) — hCaptcha or reCAPTCHA v2,
  controlled entirely by env vars, same graceful-degradation pattern as
  SMTP: if unconfigured, the widget is never rendered and server-side
  verification is skipped entirely (never blocks submission). Set **one**
  of:
  - `HCAPTCHA_SITE_KEY` + `HCAPTCHA_SECRET_KEY`, or
  - `RECAPTCHA_SITE_KEY` + `RECAPTCHA_SECRET_KEY` (hCaptcha takes
    precedence if both are set).
  Not tested live in this round since no real keys were available — the
  unconfigured (skip) path was verified (ticket submission is unaffected
  with no env vars set).
- **Agent self-service password reset** — "نسيت كلمة المرور؟" on the login
  page → `/forgot-password` (enter email) → generates a random 32-byte
  token, stores only its **SHA-256 hash** plus a **1-hour expiry** in
  `PasswordResetToken`, emails the raw token as a reset link via the
  existing `sendMail`/`emailShell` helpers (so it no-ops to a
  **console-logged link** when SMTP isn't configured, same as every other
  transactional email) → `/reset-password?token=...` lets the user set a
  new password. The token is marked used (`usedAt`) on success and
  `lookupPasswordResetToken` rejects it (or an expired one) on any
  subsequent attempt — **single-use, time-limited, never stored in
  plaintext**. The forgot-password endpoint always returns the same
  generic "if an account exists..." message regardless of whether the
  email is registered, to avoid user enumeration.

## Hardening pass (v5): forced password change, admin audit trail, TOTP 2FA

Three related additions, done together in one round because all three
touch the `User` model (`mustChangePassword`, `totpSecret`, `totpEnabled`)
and would conflict on `prisma/schema.prisma` if split into parallel work.

### Forced password change on first login

`createAgentAction` (`src/app/dashboard/agents/actions.ts`) already
generates a random temp password shown once to the inviting admin — the
new hire only ever learns it out-of-band. That account now also gets
`User.mustChangePassword: true`, and `src/middleware.ts` redirects **every**
`/dashboard/*` request except `/dashboard/change-password` itself back to
that page while the flag is set — server-side, the same enforcement point
already used for the login gate, not a client-side redirect. The flag
travels on the session JWT (see `src/lib/auth.ts`'s `jwt`/`session`
callbacks) so middleware doesn't need a DB round-trip per request; once
`/dashboard/change-password`'s `changePasswordAction` clears it in the DB,
it calls NextAuth's `unstable_update()` to refresh the JWT claim in place
so the user isn't bounced back after setting their password. The page asks
only for a new password (min. 8 chars, same validation as
`/reset-password`) — no "current password" field, since the only password
the account holder actually knows is the one an admin told them.

### Admin activity log

A new `AdminActivity` model (`id`, `actorName`, `action`, `targetType`,
`targetLabel`, `fromValue`/`toValue` — both nullable, `createdAt`) parallels
`TicketActivity` but for administrative actions that previously left no
trail: project create / branding update / ticket-form-config update,
project-membership add/remove, custom-role create/update/delete, and agent
account create/role-change/activate/deactivate. Logging calls were added
directly into the existing server actions in
`src/app/dashboard/projects/actions.ts`, `.../roles/actions.ts`, and
`.../agents/actions.ts` — inline `prisma.adminActivity.create()` calls,
same as `TicketActivity` rows are created inline throughout this codebase
rather than through a shared helper. `fromValue`/`toValue` are only
populated when there's one clean single value worth diffing (e.g. a role
rename, an agent's old→new role) — multi-field updates like project
branding or ticket-form config just log that the action happened, since
there's no single "the value" to show without over-building this into a
full field-level diff.

`/dashboard/audit` (`SUPER_ADMIN`-only, linked from the nav as "سجل
التدقيق") lists this log newest-first with a simple action-type filter
dropdown, capped at the 200 most recent rows — deliberately as plain as
`/dashboard/roles`, no pagination or per-column sorting.

### TOTP 2FA for staff accounts

Fully self-contained, no external service — works with any standard
authenticator app (Google Authenticator, Authy, etc.) via `otplib`
(TOTP generation/verification) and `qrcode` (server-rendered enrollment QR
as a data URI). `User.totpSecret` (raw base32, intentionally **not**
hashed — the server has to recompute/verify a code against it on every
login, which a one-way hash would make impossible; this is standard
practice for TOTP, documented in a schema comment) and `User.totpEnabled`
back it.

- **Enrollment** (`/dashboard/settings`, reachable by any logged-in staff
  account — no such page existed before this round): generate a secret,
  see the QR code plus a manual-entry fallback code, confirm by entering
  one valid 6-digit code. `totpEnabled` only flips true once that code
  checks out — proving the account holder actually scanned it, not just
  that a secret exists. **Disabling requires the current password**
  (bcrypt-checked server-side), not just a click, since turning 2FA off
  weakens the account.
- **Login** (`src/lib/auth.ts`'s `authorize()`): for a `totpEnabled`
  account, a correct password with no (or an invalid) code throws a custom
  `CredentialsSignin` subclass (`TotpRequiredError` / `TotpInvalidError`,
  distinguished by a `code` property) instead of returning `null`. Because
  `loginAction` (`src/app/login/actions.ts`) calls `signIn()` from a
  server action, next-auth rethrows that exact error instance back to the
  caller (verified by reading `@auth/core`'s internals — this only holds
  for the server-action/"raw" call path, not the default redirect-based
  flow), so `loginAction` can tell "needs a code" apart from "wrong
  password" via `err.code` and return a `needsTotp` state instead of an
  error. `LoginForm.tsx` reveals a second field on that response and
  resubmits with the same email/password plus the code. Accounts that
  never enrolled take the exact same single-step path as always — nothing
  about their `authorize()` branch changed.
- **Rate limiting**: TOTP code attempts go through the same
  `checkRateLimit()` used for login attempts, in the same place
  (`loginAction`, before `signIn()` is even called), keyed separately from
  the general login limiter. In practice the general login limiter (10
  attempts/hour per email+IP, counting every submission including
  password-only ones) usually catches a code-guessing burst first, since
  both limiters share the same window size and starting point — the
  dedicated TOTP bucket is still real defense-in-depth (a legitimate user
  who's already used up several attempts on password typos gets a
  slightly different budget for the code step), but its own cap rarely
  fires independently. Confirmed live either way: repeated wrong-code
  submissions do get blocked with the same "too many attempts" message the
  login limiter already shows.

## Tech stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** — Arabic-safe font stack, light/dark via `prefers-color-scheme`
- **Prisma ORM** — ships with **SQLite** for zero-dependency local dev
  (`prisma/dev.db`); switching to Postgres in production is a one-line
  datasource change (see below)
- **Auth.js (NextAuth v5)**, Credentials provider (email + bcrypt password,
  optionally a second TOTP step — see "Hardening pass" above), for the
  support team only (`SUPER_ADMIN` / `ADMIN` / `AGENT` / `CUSTOM` roles)
- **otplib** + **qrcode** (v5) — self-service TOTP 2FA, no external service
- **recharts** for the reporting dashboard
- **nodemailer** for email notifications (ticket lifecycle + password
  reset) — degrades gracefully (logs to console instead of crashing) when
  SMTP env vars aren't set

## Two kinds of users

1. **Contractors / end users (submitters)** — no account needed. They open a
   ticket via a project's public form (`/{slug}/tickets/new`, respecting
   that project's field config) and can look up ticket status later with
   **ticket number + phone number** (no password), scoped to that project.
2. **Support team** — full login via NextAuth, project-scoped per the
   access-control model above. `AGENT` works tickets in their project(s).
   `ADMIN` additionally manages that project's team, ticket-form config,
   canned responses, and reports. `SUPER_ADMIN` additionally manages all
   projects and project membership globally.

## Running locally

```bash
npm install
npx prisma migrate dev     # applies the schema to prisma/dev.db
npm run prisma:seed        # seeds users + three demo projects with tickets
npm run dev                # http://localhost:3000
```

If you're picking up an existing `dev.db` that predates this schema, this is
local dev data — reset rather than trying to backfill it:

```bash
npx prisma migrate reset --force --skip-seed   # drops + recreates dev.db, replays migrations
npm run prisma:seed
```

### Seeded data

| Role | Email | Password | Project membership |
|---|---|---|---|
| `SUPER_ADMIN` | `admin@raqaba.local` | `ChangeMe123!` | n/a — global |
| `AGENT` | `agent@raqaba.local` | `Agent123!` | `raqaba` **and** `demo` |
| `ADMIN` | `testadmin@raqaba.local` | `TestAdmin123!` | `demo` **only** — use this account to verify scoping (it must NOT see `raqaba`/`acme`) |
| `CUSTOM` ("وكيل أول" / Senior Agent) | `senioragent@raqaba.local` | `SeniorAgent123!` | `demo` **only** — base `AGENT` + `canViewReports` + `canManageCannedResponses` only (`canManageTeam`/`canManageTicketForm` stay off). Use this account to verify the custom-role permission gates: it CAN reach `/dashboard/reports` and manage canned responses for `demo`, but cannot reach `/dashboard/roles`, `/dashboard/agents`, or `demo`'s ticket-form config — all confirmed live in this round. |

Two demonstration `CustomField` rows are also seeded, one per project, so
the per-project scoping and required-field enforcement are verifiable
without any manual setup: `raqaba` gets a **required `SELECT`** field
("نوع الأصل" / asset type, options: مركبة/معدات/مبنى/أخرى) and `demo` gets
an **optional `TEXT`** field ("ملاحظة مرجعية" / reference note).

**Change the admin password immediately** — it's printed in the seed script
output specifically as a reminder. There's now a proper self-service
"forgot password" flow (see Security hardening above) so this no longer
requires Prisma Studio or a manual script.

Three projects are seeded:

- **`/raqaba`** — "رقابة+", ticket prefix `RQ`, teal/amber accent, the real
  FAQ URL, with the original 6 sample tickets attached to it.
- **`/demo`** — "مشروع تجريبي", ticket prefix `DEMO`, a distinct blue
  accent, no FAQ URL, with sample tickets.
- **`/acme`** — "مشروع اختبار ثالث", ticket prefix `ACME`, purple accent —
  exists purely as a third project with no members other than
  `SUPER_ADMIN`, useful for confirming a project with zero team members
  still works publicly and is invisible to non-members in the dashboard.

### Environment variables

Copy `.env.example` to `.env` (a working `.env` is already included for
local dev) and fill in real values for production:

| Var | Required? | Notes |
|---|---|---|
| `DATABASE_URL` | yes | `file:./dev.db` for SQLite, or a Postgres connection string in prod |
| `NEXTAUTH_SECRET` | yes | Generate with `openssl rand -base64 32` |
| `NEXTAUTH_URL` / `APP_BASE_URL` | yes | Public base URL of the app (used in email links, incl. password-reset links) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | no | If any of `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` are missing, email sending **no-ops and logs to the console** (including the password-reset link) instead of crashing. |
| `HCAPTCHA_SITE_KEY`, `HCAPTCHA_SECRET_KEY` | no | Enables hCaptcha on the public ticket form. Both must be set. |
| `RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY` | no | Enables reCAPTCHA v2 instead, if hCaptcha vars aren't set. |

## Path to real production deploy

1. **Host**: Deploy to Vercel (or any Node host).
2. **Database**: Provision a hosted Postgres (Neon, Supabase, RDS, etc.).
   A complete, ready-to-apply reference schema for this already exists at
   **`prisma/schema.postgres.prisma`** — it's identical to the active
   `prisma/schema.prisma` except `datasource.provider` is `"postgresql"`
   and every String field that was standing in for a fixed enum (SQLite
   has no native enum type) is a real Prisma `enum`. `Ticket.category` is
   deliberately left as a plain String in both — as of v6 it holds a
   project-defined `Category.key`, not a fixed set of values, so it must
   never become an enum.

   This reference file isn't auto-loaded by any `prisma` command (only
   `prisma/schema.prisma` is), so it can't accidentally affect the running
   SQLite app. It HAS been verified two real ways without needing a live
   Postgres connection:
   ```bash
   npx prisma validate --schema=prisma/schema.postgres.prisma   # schema is syntactically/semantically valid
   npx prisma generate --schema=prisma/schema.postgres.prisma   # a full, real Prisma Client compiles from it
   ```
   Both succeeded. What this does NOT prove: that a real Postgres server
   accepts the generated migration SQL and that existing data converts
   cleanly — that needs an actual instance. To apply for real:
   1. Copy `prisma/schema.postgres.prisma`'s content over
      `prisma/schema.prisma` (they're small enough to diff/reconcile by
      hand if `schema.prisma` has drifted since this was written).
   2. Point `DATABASE_URL` at the real Postgres instance.
   3. Run `npx prisma migrate dev --name convert_to_postgres`. Prisma
      generates the `ALTER TABLE ... TYPE "EnumName" USING ...` for each
      converted column automatically — this works cleanly because every
      value ever written to those columns is already a member of the new
      enum (the enum lists were built directly from this schema's own
      documented "allowed values"). As cheap insurance before running this
      against real production data, spot-check with something like
      `SELECT DISTINCT role FROM "User"` per converted column first.
   4. Run `npx prisma generate` and redeploy.
3. **File storage**: `uploads/` is local disk, which doesn't persist across
   most serverless deploys. For production, swap `src/lib/upload.ts` to
   write to S3/R2/Blob storage instead of the local filesystem.
4. **Email**: set real `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`.
5. **Rate limiting**: swap the in-memory limiter in `src/lib/rateLimit.ts`
   for a shared store (Redis `INCR`+`EXPIRE` or similar) once running more
   than one instance.
6. **CAPTCHA**: set real `HCAPTCHA_SITE_KEY`/`HCAPTCHA_SECRET_KEY` (or the
   reCAPTCHA equivalents) before wide public exposure.
7. **Secrets**: generate a fresh `NEXTAUTH_SECRET`, set `NEXTAUTH_URL` /
   `APP_BASE_URL` to the real production domain.
8. Onboard real projects via `/dashboard/projects` as a `SUPER_ADMIN`, then
   assign `ADMIN`/`AGENT` memberships from each project's edit page — no
   code changes needed per project.

## Project structure (high-level)

```
prisma/schema.prisma            Data model (SQLite now, Postgres-ready)
prisma/schema.postgres.prisma   (v7) reference schema for the eventual Postgres move — real enums,
                                 validated + client-generated, see "Path to real production deploy"
prisma/seed.ts                  Seed script (3 users, 3 projects, tickets, memberships)
src/lib/access.ts               Project-scoped access control (getViewerScope, canAccessProject, ...)
src/lib/ticketQueue.ts          Shared ticket-queue where/orderBy builder (v4) — used by /dashboard AND /dashboard/export.csv
src/lib/rateLimit.ts            In-memory fixed-window rate limiter
src/lib/captcha.ts              Optional hCaptcha/reCAPTCHA v2 support
src/lib/passwordReset.ts        Hashed, single-use, time-limited reset tokens
src/lib/totp.ts                 (v5) otplib/qrcode wrapper — secret gen, QR data URI, code verification
src/lib/                        auth, prisma client, mail, notifications, SLA calc,
                                 upload, config, projects (slug resolution + field-mode types)
src/middleware.ts                protects /dashboard/* behind NextAuth; (v5) also forces
                                 /dashboard/change-password while mustChangePassword is set
src/app/page.tsx                project directory / picker (home page)
src/app/[slug]/                 project-scoped public pages (landing, tickets/new, tickets/track)
src/app/tickets/{new,track}     legacy redirects to /raqaba/tickets/...
src/app/csat/[ticketId]/        public one-click CSAT rating landing page (v4)
src/app/forgot-password/        request a password reset link
src/app/reset-password/         set a new password from a valid token
src/app/dashboard/               support team (project-scoped)
src/app/dashboard/TicketQueueTable.tsx  ticket queue table incl. checkboxes + bulk-action bar (v4, client component)
src/app/dashboard/bulk-actions.ts       bulk status/assign/tag server actions, per-ticket access re-check (v4)
src/app/dashboard/export.csv/   CSV export of the currently-filtered queue (v4)
src/app/dashboard/change-password/  (v5) forced first-login password change
src/app/dashboard/settings/     (v5) self-service TOTP 2FA enrollment/disable, any staff account
src/app/dashboard/audit/        (v5) SUPER_ADMIN-only admin activity log
src/app/dashboard/projects/     SUPER_ADMIN: create/edit any project; ADMIN: own project(s) only
src/app/dashboard/projects/[id] ticket-form config + team membership
src/app/dashboard/canned-responses/  manage reusable reply templates
src/app/dashboard/tickets/[id]/ ticket detail: reply, controls, tags, activity log, CSAT rating (v4)
src/app/api/uploads/[...path]   serves uploaded files from outside /public
uploads/                        uploaded files live here (gitignored)
```

## Scaling: one shared database, not one-per-project

At real scale, splitting into a separate database per project was
considered and deliberately rejected — it doesn't actually make searches
within a project faster (proper indexing does that), and it would break
every cross-project view (`SUPER_ADMIN`'s project picker, the shared
ticket queue, cross-project reports), turn "create a project" from a
single database row into "provision a database + run every migration
against it", and multiply migrations/connection-pooling/backups by the
number of projects. One shared database, scoped by `projectId` and
properly indexed, comfortably handles tens of millions of rows.

What's actually in place for this:
- Composite indexes on `Ticket` matching the real query shapes —
  `[projectId, createdAt]`, `[projectId, status]`, `[projectId, slaDueAt]`
  — not just single-column indexes, since every dashboard query scopes by
  project first and then filters/sorts by one of these.
- The ticket queue (`/dashboard`) is properly paginated (25/page, real
  `skip`/`take` + `count()`) instead of a hard 200-row cap with no way to
  see past it. The "متأخرة فقط" (overdue-only) filter is a real `WHERE`
  clause now (`slaDueAt < now()` + status not resolved/closed), not an
  in-memory `.filter()` applied only to whatever page happened to be
  fetched — so both the count and the filter stay accurate no matter how
  many tickets a project accumulates.
- **Not yet done, worth knowing:** the reports page (`/dashboard/reports`)
  still pulls every ticket in scope into memory to compute status/category
  breakdowns, the 30-day time series, average resolution time, and SLA
  compliance %. The status/category counts are easy wins to push down to
  the database via `groupBy`/`count`. Average-resolution-time and
  SLA-compliance % are harder — they need `resolvedAt - createdAt` style
  computed comparisons that Prisma's high-level API can't express as a
  simple aggregate, so a correct fix means either raw SQL or moving those
  two specific numbers to Postgres (planned anyway) and using its window
  functions. Left as a documented follow-up rather than risking a rushed
  change to numbers your team will actually rely on for SLA reporting.
- Also on the roadmap either way: move from SQLite to Postgres for a real
  deploy (see "Path to real production deploy" below) — SQLite was never
  the answer to "huge scale" regardless of the per-project-DB question.

## Known gaps / TODOs

- (v6) The reports page's "by category" breakdown doesn't render at all
  when multiple/all projects are in view (no `projectId` filter applied) —
  see "Per-project ticket categories" above for why. A viewer who wants
  that chart has to pick one project at a time; there's no combined
  cross-project category view.
- (v6) The ticket-queue category filter's `<optgroup>`-per-project grouping
  means picking a category when viewing multiple/all projects still only
  ever filters by that one project's specific key — there's no "show me
  every project's 'الأداء'-equivalent category at once" option, since
  categories are independent per-project strings with no cross-project
  identity.
- (v7) Still running on SQLite. The Postgres migration path is now fully
  prepared and verified as far as possible without a real instance — see
  `prisma/schema.postgres.prisma` and "Path to real production deploy"
  above — but actually applying it and confirming real data converts
  cleanly needs a live Postgres server, which wasn't available in this
  environment (no Docker, no native install).
- File uploads are stored on local disk (`uploads/`) — fine for a single
  server / local dev, but needs to move to object storage (S3/R2) for a
  serverless or multi-instance production deploy.
- No automated test suite (unit/e2e) — verified by building and manually
  exercising the flows in a real browser (see below).
- Rate limiting is in-memory/per-process — see "Path to real production
  deploy" above for the multi-instance caveat.
- CAPTCHA support (`src/lib/captcha.ts`) has been verified against both
  providers' real verification APIs using their officially-published
  public test credentials (designed by each provider specifically so
  integration code can be tested without a real site registration):
  - reCAPTCHA: Google's documented test secret
    (https://developers.google.com/recaptcha/docs/faq) returned
    `success:true` for any response token, and a garbage secret correctly
    returned `success:false` — confirming the request isn't just trivially
    always-true.
  - hCaptcha: hCaptcha's documented test secret + test response token
    (https://docs.hcaptcha.com/#integration-testing-test-keys) returned
    `success:true` (`hostname:"dummy-key-pass"`); an arbitrary (non-test)
    response token was correctly rejected.
  Both confirm this app's exact request shape (`secret` + `response`, no
  `sitekey` needed) is correct against the real APIs. What's still
  unverified is the full end-to-end UI flow — the actual widget rendering
  and a human solving it — which needs your own site registration with
  either provider; the "unconfigured, skipped" no-widget path has already
  been verified live in the app.
- No "archive/deactivate a project" flow — a project's public pages stay
  live as long as its row exists.
- `ADMIN` team-member listings on `/dashboard/agents` can reveal that a
  teammate also belongs to a project the viewing `ADMIN` isn't a member of
  (just the project *name*, as a badge — no ticket data). This was a
  judgment call to keep the teammate-project display simple; if that's too
  much information leakage for your deployment, filter the project-name
  badges shown per row to only projects the viewer shares with that user.
- **CSAT rating links are one-click GETs**, not confirmation forms — a
  corporate email "safe link" scanner that pre-fetches URLs in incoming
  mail could theoretically record a rating the submitter never actually
  clicked. Accepted deliberately per spec ("this is a low-stakes action...
  don't over-engineer this") and mitigated somewhat by being idempotent
  (a scanner pre-fetch just "burns" the first rating; a real click after
  that shows "already rated" instead of erroring) — but worth knowing if
  this app is ever deployed behind an email gateway that does that.
- The CSV export has no row cap — a project with an extremely large ticket
  history exports everything matching the filter in one request/response.
  Fine at this app's current scale (see "Scaling" above); if a project
  grows into the tens/hundreds of thousands of tickets, this should move
  to a streamed response or a background-job-plus-download-link pattern
  instead of building the whole CSV in memory.
- Bulk-assign does not re-validate that the chosen agent actually has
  `ProjectMembership` in the ticket's project before assigning — this
  matches the existing single-ticket `updateTicketAction`, which has the
  same gap today (the assignee dropdown is pre-scoped client-side, but
  nothing re-checks it server-side). Not introduced by this round; flagged
  here since bulk operations make it easier to hit across many
  tickets/projects at once than a single assignment does.
- (v5) The dedicated TOTP rate-limit bucket is real but largely shadowed by
  the pre-existing general login limiter, which already caps every
  submission (password-only or code) at 10/hour per email+IP — see
  "Hardening pass" above. Not a security gap (codes ARE capped, confirmed
  live), just worth knowing if you ever want the two limits to behave
  independently (e.g. a generous password-retry budget but a tight
  code-retry budget) — that would need the general limiter to stop
  counting code-only resubmissions.
- (v5) `/dashboard/audit` has no pagination past its 200-row cap, same
  proportionate "keep it simple" choice as `/dashboard/roles` not having
  any list controls beyond a single filter — a deployment with heavy admin
  activity over a long period would eventually want real pagination or a
  date-range filter here.
- (v5) Disabling TOTP clears `totpSecret` entirely rather than keeping it
  around — re-enabling always means a fresh QR scan. This was a deliberate
  choice (a stale secret sitting in the DB unencrypted after being
  "disabled" felt like the wrong default), but means there's no "pause and
  resume with the same secret" option.
- (v5) `AdminActivity` has no foreign key to the `User`/`Project`/
  `CustomRole` rows it describes — `actorName`/`targetLabel` are plain
  string snapshots, same reasoning as `TicketActivity`. This means a
  renamed user or project shows its *old* name in historical log entries,
  which is intentional (an audit log should read as "what happened at the
  time", not silently rewrite itself when the underlying row changes
  later) but worth knowing if you expected it to always reflect current
  names.

## Verification performed

- `npx prisma migrate dev` (new migration
  `project_scoping_and_features`), `npm run prisma:seed`, `npx tsc --noEmit`,
  and `npm run build` all run clean.
- Manually exercised end-to-end in a real browser against the dev server:
  - Logged in as `testadmin@raqaba.local` (demo-only `ADMIN`): confirmed
    the ticket queue, reports, agents list, project list, and canned
    responses all show **only** `demo` data; confirmed direct navigation to
    a `raqaba` ticket URL and to a `raqaba` project id both 404; confirmed
    `/dashboard/projects` shows a scoped "مشاريعي" list with only `demo`.
  - Logged in as `agent@raqaba.local`: confirmed it still sees its
    previously-assigned tickets in **both** `raqaba` and `demo` (19 tickets
    across both projects visible in the queue).
  - As `SUPER_ADMIN`, removed `testadmin`'s `demo` membership from
    `/dashboard/projects/[id]`, confirmed `testadmin` then 404s on every
    dashboard page (zero memberships); re-added the membership and
    confirmed access returned.
  - Set `raqaba`'s `contractNumberMode` to `HIDDEN`, confirmed
    `/raqaba/tickets/new` no longer renders the field while `/demo/tickets/new`
    is unaffected; then injected a spoofed `contractNumber` field via
    DOM manipulation (simulating a malicious client bypassing the hidden
    UI) and submitted the real form — confirmed the server discarded it
    (`contractNumber: null` in the DB for the created ticket) rather than
    trusting the client. Restored the setting to `OPTIONAL` afterward.
  - Created a canned response as `testadmin` (scoped to `demo`), opened a
    `demo` ticket, used the picker to insert it into the reply textarea
    (still editable, confirmed via the textarea's live value before
    sending), and sent the reply — it appeared as a normal agent message.
  - Added a new tag inline on a ticket, confirmed it appears as a chip,
    confirmed the queue's tag filter narrows the list to exactly that
    ticket.
  - Confirmed a priority change and a tag add both produced correctly
    worded, timestamped entries in the ticket's "سجل النشاط" (activity
    log), and that the automatic PENDING status transition on a
    non-internal reply also logs an activity entry.
  - Submitted the honeypot field filled-in via DOM injection + a real form
    submit (bypassing the hidden-field UI, the closest equivalent to a raw
    POST given this app's use of React server actions rather than a plain
    REST endpoint) — confirmed no ticket was created and no error was
    shown; confirmed a normal submission on the same project still works
    and gets a ticket number.
  - Verified the rate-limiter's counting logic directly (5 allowed, 2
    denied across 7 rapid calls against a 5/hour limit).
  - Triggered `/forgot-password` for `agent@raqaba.local`, confirmed the
    reset link was logged to the console (no SMTP configured), followed
    it, set a new password, confirmed login with the new password
    succeeds, and confirmed the token's `usedAt` is set in the DB
    (single-use enforced).

## Verification performed (v3 — custom roles + custom fields)

- `npx prisma migrate dev` (new migration `add_custom_roles_and_fields`),
  `npx prisma migrate reset --force && npm run prisma:seed` (confirms the
  seed reproduces cleanly from scratch), `npx tsc --noEmit`, and
  `npm run build` (fresh `.next`) all run clean.
- Manually exercised end-to-end in a real browser against the dev server:
  - As `SUPER_ADMIN` on `/dashboard/roles`: confirmed the seeded "وكيل أول"
    role (base `AGENT` + `canViewReports` + `canManageCannedResponses`)
    lists correctly with its toggle state and assigned-user count (1).
    Created a second role ("مدير محدود", base `ADMIN`) through the actual
    create form, switching the base-role selector to `ADMIN` and
    confirming the 4 toggle checkboxes auto-checked, then manually
    unchecked `canManageTeam` before submitting — confirmed the resulting
    row shows `canManageTeam: —` and the other 3 toggles `✓`, proving both
    the pre-check-to-default behavior and independent overridability.
  - Confirmed both new custom roles appear in `/dashboard/agents`'s role
    picker (grouped under "أدوار مخصصة") and in each existing user's
    per-row role `<select>`.
  - Logged in as `senioragent@raqaba.local` (the seeded "وكيل أول"
    account): confirmed the dashboard nav shows only "التذاكر", "التقارير",
    and "الردود الجاهزة" (no "الأدوار المخصصة", "فريق الدعم", or
    "المشاريع"); confirmed `/dashboard/reports` and
    `/dashboard/canned-responses` load successfully and are scoped to
    `demo` only; confirmed direct navigation to `/dashboard/roles`,
    `/dashboard/agents`, and `/dashboard/projects` all redirect back to
    `/dashboard` rather than rendering.
  - Logged in as plain `agent@raqaba.local` (built-in `AGENT`, no custom
    role): confirmed `/dashboard/roles` and `/dashboard/projects` both
    redirect to `/dashboard`; confirmed direct navigation to
    `/dashboard/projects/<raqaba-id>` (a project this agent **is** a
    member of, to isolate the permission check from the membership check)
    also redirects rather than rendering the ticket-form config section.
  - On the public forms: confirmed `/raqaba/tickets/new` renders only
    `raqaba`'s custom field ("نوع الأصل", required `SELECT`) and
    `/demo/tickets/new` renders only `demo`'s ("ملاحظة مرجعية", optional
    `TEXT`) — never the other project's field.
  - Spoofed a client-side bypass of the required custom field on
    `/raqaba/tickets/new`: removed the `required` attribute from the
    "نوع الأصل" `<select>` via injected JS, left it blank, and force-
    submitted the form. The server rejected it with
    `الحقل "نوع الأصل" مطلوب.` and created no ticket — confirming the
    required check is enforced server-side, not just via the `required`
    HTML attribute. Filled the field in and resubmitted — ticket
    `RQ-000007` was created successfully.
  - On `RQ-000007`'s ticket detail page: confirmed the "بيانات إضافية"
    card shows "نوع الأصل: مركبة"; used its inline "تعديل" control to
    change the value to "معدات" then "مبنى", confirming each change
    persisted across a full page reload and that the editor auto-closes
    back to the read view on a successful save.

## Deviations / judgment calls (v3)

- **"بيانات إضافية إضافية"**: the spec's literal Arabic section heading
  repeats "إضافية" twice, which reads as a typo ("extra extra info") in
  Arabic rather than an intentional idiom. Used the singular "بيانات
  إضافية" instead.
- **Deleting an in-use `CustomRole`**: blocked outright (with an error
  naming the affected account count) rather than silently reassigning
  those users to a fallback role — see "Custom roles" above for the
  reasoning.
- **`fieldType`/`key` are immutable after a `CustomField` is created** —
  editing only allows changing the label, required flag, and (for
  `SELECT`) the options list. Changing the underlying type or slug after
  tickets have already stored values against it would silently
  misinterpret historical `TicketFieldValue.value` strings.
- **Permission toggles are per-user, not per-membership**: a `CustomRole`
  is linked once via `User.customRoleId` and applies uniformly across
  every project the user belongs to — there's no per-project override of
  a custom role's toggles. This matches how `ADMIN`/`AGENT` already work
  (the built-in role is also a single, non-per-project value) and keeps
  the mental model consistent.
- **Reordering custom fields** uses simple adjacent-swap ↑/↓ buttons
  rather than drag-and-drop, since the spec's own framing ("a small
  number of fields") doesn't warrant the added complexity/dependency.
- **Checkbox custom fields** are never blocked by `required` — an
  unchecked required checkbox is treated as a valid (if unusual) "false"
  answer rather than a submission blocker, since HTML checkboxes have no
  meaningful "empty" state distinct from unchecked.

## Verification performed (v4 — CSAT, bulk actions, CSV export, "my tickets")

- `npx prisma migrate dev` (new migration `add_csat_rating`),
  `npx tsc --noEmit`, and `npm run build` all run clean.
- Manually exercised end-to-end in a real browser against the dev server
  (logged in as `agent@raqaba.local` unless noted):
  - **Bulk status change**: selected 2 tickets (`RQ-000001`, `RQ-000006`,
    both `NEW`) on `/dashboard`, applied "قيد المعالجة" from the bulk bar —
    the bar reported "تم تحديث 2 تذكرة.", both rows updated in place
    without a full page reload, and `RQ-000001`'s "سجل النشاط" showed a
    correctly-worded, timestamped `STATUS_CHANGED` entry attributed to the
    logged-in agent.
  - **Bulk assign**: filtered to "غير مسندة" (unassigned), selected all 4
    on the page via the header checkbox (confirmed "4 محددة"), clicked
    "إسناد لنفسي" — the bar reported "تم تحديث 4 تذكرة.", the (still
    unassigned-filtered) view correctly dropped to 0 results, and
    `RQ-000007`'s activity log showed "غيّر الإسناد من غير مسندة إلى أحمد
    الدعم الفني" with a timestamp.
  - Bulk add-tag was reasoned about rather than separately clicked through
    live — it reuses the identical `loadAccessibleTickets` +
    per-ticket-activity-log pattern as the two bulk actions above and the
    same project-match check as the existing single-ticket
    `addExistingTagAction`, so it was code-reviewed rather than re-verified
    live given time constraints.
  - **CSAT end-to-end**: resolved `RQ-000001` (which has a submitter
    email) via the single-ticket status dropdown; confirmed the
    `[mail:no-op]` console log now prints the plain-text fallback with all
    5 `/csat/<id>?rating=N` links spelled out (see "Deviations" below for
    why a `text` fallback was added). Visited the `rating=4` link directly
    — got "شكرًا لتقييمك" with 4 filled stars. Re-visited the `rating=1`
    link on the same ticket — got "تم تقييم هذه التذكرة مسبقًا بـ 4/5"
    (rating **not** overwritten, no error shown). Confirmed
    `/dashboard/tickets/[id]` now shows "تقييم الرضا: ⭐⭐⭐⭐ (4/5)" with the
    submission timestamp. Logged in as `admin@raqaba.local`
    (`SUPER_ADMIN`) and confirmed `/dashboard/reports` shows "متوسط تقييم
    الرضا: 4.0/5 (1 تقييم)".
  - **CSV export**: fetched `/dashboard/export.csv?status=RESOLVED` from
    the browser (authenticated session) and inspected the raw response —
    confirmed the first 3 bytes are the UTF-8 BOM (`EF BB BF`), the header
    row and all cell values are correct, un-mangled Arabic, and the
    `status=RESOLVED` filter correctly limited the export to exactly the 2
    tickets that were `RESOLVED` at that point (`RQ-000001`, `RQ-000004`)
    out of the project's full ticket set — confirming the export reflects
    the filtered set, not everything.
  - **"My tickets" filter**: as `agent@raqaba.local`, clicked "تذاكري
    فقط" from the unfiltered queue (9 tickets) — chip switched to "✓
    تذاكري فقط" (active styling) and the queue correctly narrowed to the 4
    tickets assigned to that agent.
  - Not separately re-verified live in this round (unchanged, already
    covered by earlier verification rounds documented above): the
    project-scoping defense-in-depth itself (`canAccessProject` rejecting
    an out-of-scope id) — the bulk actions' `loadAccessibleTickets` helper
    calls the exact same `canAccessProject()` function that was already
    live-verified for the single-ticket path in the v2 round, so this was
    reviewed in code rather than re-clicked through with a second
    low-privilege account.

## Deviations / judgment calls (v4)

- **CSAT recording happens on a plain GET**, inside the `/csat/[ticketId]`
  Server Component itself, not behind a POST/confirmation step — this is
  exactly what the spec asked for ("no separate token needed, don't
  over-engineer this"; "records the rating... shows a... confirmation
  page"), and it's idempotent (a second visit never overwrites), which
  bounds the downside of e.g. an email-security-scanner pre-fetching the
  link. Documented as a known trade-off in "Known gaps" above rather than
  silently accepted.
- **`notifyResolved` gained a `text` fallback** for `sendMail`, mirroring
  the pattern already used by `src/app/forgot-password/actions.ts` for its
  reset link. Without it, the CSAT rating links only existed inside the
  HTML body, which the no-SMTP console-log path (`src/lib/mail.ts`) never
  prints (it only prints `subject` + `text`, never `html`) — so with no
  real SMTP configured, the "one-click email link" would have been
  genuinely unreachable in local/dev testing. This wasn't explicitly
  asked for but follows an existing, established pattern in this exact
  codebase for exactly this problem.
- **`/dashboard/export.csv` as a literal folder name** containing
  `route.ts` — Next.js App Router treats a folder name as a literal URL
  segment unless it uses reserved bracket/parenthesis syntax, so
  `src/app/dashboard/export.csv/route.ts` maps directly to
  `/dashboard/export.csv` with no rewrite needed. Confirmed via
  `npm run build`'s route table and a live fetch.
- **Bulk-tag silently skips a ticket from a different project than the
  chosen tag** (tags are project-scoped) rather than erroring the whole
  batch — consistent with how out-of-scope/inaccessible ticket ids are
  handled (skip + count, don't block everyone else's valid changes).
- **The "select all on this page" checkbox is page-scoped**, not
  "select all N tickets across every page" — selecting across pages would
  either require holding onto ids across a server-rendered pagination
  boundary or a separate "select all matching filter" server call; the
  spec's wording ("select all on this page") matches what was built, so
  this wasn't extended further.
- **Bulk assign has no dedicated "assign to a specific agent not in the
  dropdown" escape hatch** — the assignee `<select>` is the same
  project-relevant agent list already computed for the filter bar, so an
  agent who has access to none of the selected tickets' project(s) simply
  isn't offered as an option, matching the single-ticket page's existing
  behavior.

## Verification performed (v5 — forced password change, admin audit trail, TOTP 2FA)

- One combined migration (`add_password_enforcement_audit_totp`, since all
  three features' schema changes touch `User` and were done as one round),
  `npx tsc --noEmit`, and `npm run build` (fresh `.next`) all run clean
  after each of the three sub-features and again at the end.
- Manually exercised end-to-end in a real browser against the dev server:
  - **Forced password change**: as `admin@raqaba.local`, created a new
    `AGENT` account (`newhire@raqaba.local`) from `/dashboard/agents`,
    noted the generated temp password. Logged in as that account — landed
    on `/dashboard/change-password` instead of the ticket queue. Tried
    navigating directly to `/dashboard` — bounced straight back to the
    change-password page (server-side, confirmed by the URL never
    resolving to the ticket queue). Set a new password (min. 8 chars) —
    succeeded, and clicking "المتابعة إلى لوحة التحكم" landed on the
    ticket queue with no redirect loop (confirming the `unstable_update()`
    JWT refresh worked, not just the DB flag). Logged in again as
    `agent@raqaba.local` (a pre-existing account, never admin-created,
    `mustChangePassword: false`) — went straight to the dashboard as
    before, confirming existing accounts are unaffected.
  - **Admin audit trail**: as `admin@raqaba.local`, created a project,
    renamed it (branding update), changed its ticket-form config, added
    and removed a project member, created a custom role, renamed it,
    deleted it, and created/activated/deactivated/role-changed the new
    agent account — 12 actions total. `/dashboard/audit` showed all 12,
    newest first, with correct actor names, target labels, and from→to
    values where applicable (e.g. "دور اختبار السجل ← دور اختبار السجل
    المعدّل" for the role rename, "موظف دعم ← مدير" for the role change).
    The action-type filter dropdown correctly narrowed the list to just
    `PROJECT_CREATED` when selected. Logged in as plain `agent@raqaba.local`
    (no `SUPER_ADMIN`) and confirmed direct navigation to `/dashboard/audit`
    redirects to the ticket queue instead of rendering.
  - **TOTP 2FA**: as `newhire@raqaba.local`, opened `/dashboard/settings`,
    clicked "تفعيل المصادقة الثنائية" — got a QR code and a manual-entry
    secret (`H7LMHPMNV3BOESQPD2ZRPKSRYNIMT5FP` on the first run). Rather
    than reading the QR visually, computed a real TOTP code for that exact
    secret with a small one-off script calling otplib's own `generate()`
    function directly (the same math an authenticator app runs), and
    submitted that computed code to confirm enrollment — succeeded,
    status flipped to "مفعّلة ✓". Logged out and back in: the password-only
    submission correctly revealed the code field instead of erroring;
    submitting a wrong code (`000000`) was rejected with "رمز التحقق غير
    صحيح أو منتهي الصلاحية."; computing a fresh valid code and submitting
    it completed sign-in normally. Re-enrolled with a second fresh secret
    and deliberately submitted 8 more wrong codes in a row from the login
    form — the combined login+TOTP rate limiting kicked in and blocked
    further attempts with "تم تجاوز عدد محاولات الدخول المسموح." (see
    "Known gaps" for why this fires via the general login limiter rather
    than the dedicated TOTP one in practice). Tested disabling 2FA: a
    wrong current password was rejected ("كلمة المرور الحالية غير
    صحيحة."), the correct password succeeded and flipped the status back
    to "غير مفعّلة". Finally, logged in as `agent@raqaba.local` (never
    enrolled in 2FA) after all of the above and confirmed it still signs
    in single-step, completely unaffected.

## Deviations / judgment calls (v5)

- **`otplib` 13.x ships a functional API** (`generateSecret`,
  `generateURI`, `verify` as top-level exports), not the classic
  `authenticator` singleton object from older otplib versions that most
  existing tutorials/snippets reference — confirmed by reading the
  installed package's own type definitions rather than assuming. `src/lib/totp.ts`
  is written against the actual installed API.
- **The forced change-password page intentionally rejects use as a general
  "change my password" endpoint** — `changePasswordAction` checks
  `session.user.mustChangePassword` and refuses if it's already `false`.
  The spec only asked for the first-login-forced case (explicitly "no
  current password field" because the account holder only knows the temp
  one), and building a second, weaker path to change a password without
  proving the current one felt like a real gap worth avoiding rather than
  silently allowing. A general self-service "change my password while
  logged in" page (which reasonably *would* want a current-password
  check) wasn't asked for and wasn't added.
- **2FA enrollment saves the secret to `User.totpSecret` immediately on
  generation**, before the confirming code is entered — `totpEnabled`
  stays `false` until confirmation, so an abandoned enrollment never
  weakens the account, but it does mean a generated-then-never-confirmed
  secret sits in the DB until the next "تفعيل المصادقة الثنائية" click
  overwrites it. Simpler than threading the unconfirmed secret through the
  UI without ever persisting it, and has no security downside since it's
  inert without `totpEnabled: true`.
- **TOTP rate-limit key is `totp:<email>:<ip>`**, a separate bucket from
  the login limiter's `login:<email>:<ip>`, per the spec's instruction to
  reuse `checkRateLimit()` "the same way login attempts already are" — see
  "Known gaps" for why the two buckets mostly overlap in practice given
  they share a window size and the general limiter counts every
  submission unconditionally.
- **`/dashboard/settings` has no permission gate beyond being logged in**,
  per spec ("reachable by any logged-in staff account") — it only ever
  touches the signed-in user's own account, so none of the project-scoping
  or `EffectivePermissions` machinery applies here, unlike almost every
  other `/dashboard/*` page.
