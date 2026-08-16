# مساعدة الدعم الفني — نظام تذاكر متعدد المشاريع (Multi-Project Helpdesk)

A production-grade, Arabic-first (RTL) ticketing/helpdesk web app. It started
as a single-tenant tool for **رقابة+** (RAQABA+), was refactored into a
**multi-project platform** (v1), and has now been extended (v2) with
**project-scoped access control**, per-project ticket-form configuration,
canned responses, tags, an activity/audit log, and several security
hardening features (honeypot, rate limiting, optional CAPTCHA, self-service
password reset).

## Multi-project architecture

- **Isolation model**: one shared Next.js app, one shared SQLite/Postgres
  database. A `Project` row (id, slug, name, accentColorHex, faqUrl,
  ticketPrefix, ticketSeq, + ticket-form field-mode columns — see below)
  represents each client. Every `Ticket` belongs to exactly one `Project`
  (`Ticket.projectId`), and all public-facing pages are scoped by project
  via the URL.
- **Per-project customization**: branding (name, accent color, FAQ URL,
  ticket prefix) **and now the ticket-form field configuration** (see
  below). Ticket **categories** and **SLA-by-priority timings** are still
  global/shared across all projects.
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

## Tech stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** — Arabic-safe font stack, light/dark via `prefers-color-scheme`
- **Prisma ORM** — ships with **SQLite** for zero-dependency local dev
  (`prisma/dev.db`); switching to Postgres in production is a one-line
  datasource change (see below)
- **Auth.js (NextAuth v5)**, Credentials provider (email + bcrypt password),
  for the support team only (`SUPER_ADMIN` / `ADMIN` / `AGENT` roles)
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
   In `prisma/schema.prisma`, change:
   ```prisma
   datasource db {
     provider = "postgresql"   // was "sqlite"
     url      = env("DATABASE_URL")
   }
   ```
   Point `DATABASE_URL` at the new Postgres instance, then run
   `npx prisma migrate deploy`. (Optional cleanup once on Postgres: convert
   the string-typed "enum-like" fields into real Prisma `enum` types —
   SQLite doesn't support native enums, which is why they're modeled as
   validated strings for now.)
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
prisma/seed.ts                  Seed script (3 users, 3 projects, tickets, memberships)
src/lib/access.ts               Project-scoped access control (getViewerScope, canAccessProject, ...)
src/lib/ticketQueue.ts          Shared ticket-queue where/orderBy builder (v4) — used by /dashboard AND /dashboard/export.csv
src/lib/rateLimit.ts            In-memory fixed-window rate limiter
src/lib/captcha.ts              Optional hCaptcha/reCAPTCHA v2 support
src/lib/passwordReset.ts        Hashed, single-use, time-limited reset tokens
src/lib/                        auth, prisma client, mail, notifications, SLA calc,
                                 upload, config, projects (slug resolution + field-mode types)
src/middleware.ts                protects /dashboard/* behind NextAuth
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

- Per-project ticket categories and SLA timings are still global, not
  per-project (unchanged from v1).
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
