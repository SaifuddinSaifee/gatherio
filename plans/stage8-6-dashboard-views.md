# Stage 8.6 — Dashboard views (data table + list)

## Context
Stage 8.5 turned the dashboard into a card list: each case shows who is holding it up, recent activity, and a one-click reminder. That works well for working through cases one at a time. It works poorly for **finding, filtering and acting on many cases at once**, which becomes the main job once a requester has more than a screenful of clients (product.md §8.2's ICP runs 20–200 recurring clients).

Stage 8.6 gives the dashboard two views of the same data:
1. **Data table** (the default): scan, search, filter by status/template/attention, sort any column, hide columns, select rows, and send reminders in bulk. The interaction pattern follows shadcn's data-table example; everything is built from our own Material components.
2. **List**: the Stage 8.5 cards, refined so each case reads as an action item, grouped by whose move it is.

**Settled with the user:** exactly two views. The table is the default. The chosen view is remembered **per browser** (not per account), so after signing out and back in you see the view you left.

## Design decisions (settle here, don't re-litigate while building)

| # | Decision | Why |
|---|---|---|
| 1 | **The view preference is a cookie** (`gather_dashboard_view`, 1 year, **`path=/`**), set by a server action and read by the server page. | It lives in the browser as requested, but the server renders the right view on the first response. localStorage would flash the table before switching to the list. Sign-out clears only auth cookies, so the preference survives. **`path=/`, not `/dashboard`** (a bug caught by e2e): sign-in posts to `/sign-in` and Next renders the `/dashboard` redirect inside that same request, which a `/dashboard`-scoped cookie never reaches. |
| 2 | **Hidden table columns are a second cookie** (`gather_dashboard_hidden_columns`, `path=/`), written by the client on toggle and read by the server. `Open for` and `Created` are hidden by default. | Same no-flash reason. Column toggles are instant client-side, so there's no server round trip per click. |
| 3 | **TanStack Table v9** (`@tanstack/react-table`, headless) does sorting, pagination, selection and column visibility. **Filtering happens before the table** in a pure, unit-tested module (`dashboard-table.ts`). | Filter semantics (OR within a facet, AND across facets, facet counts that respect the other filters) are product rules and belong in tested domain code, not in table configuration. No shadcn/Radix components: they're a different design system from design-revised.md. v9's API differs from the v8 code in shadcn's docs (`useTable` + `tableFeatures`, not `useReactTable` + `getCoreRowModel`). |
| 4 | **Every dashboard read still happens on the server** (`listCases`). The client gets a flat, serialisable `CaseTableRow[]` plus the server's `now`. | All relative times ("3 days ago") are computed from the server's `now`, so the server render and hydration can't disagree. At the ICP's scale (hundreds of cases), filtering client-side is instant; server pagination can come later without changing the row shape. |
| 5 | **Table state lives in the URL** (`q`, repeated `status`/`template`/`flag`, `sort`, `page`, `size`), parsed on the server and kept in sync with `history.replaceState`. Unknown values are dropped. | A filtered view survives reload and can be bookmarked. Reminder actions return to exactly the filtered view they came from. |
| 6 | **The default table order is the Stage 8.5 priority order** (`sortForDashboard`). Clicking a header sorts by that column; a third click returns to priority order. | "Needs your review" first stays the default without a fake "Priority" column. |
| 7 | **Bulk reminders reuse `sendManualReminder` one case at a time** via a new `sendManualReminders`, which returns `{ sent, skipped, failed }`. Only selected cases that are *currently* eligible are submitted; the server re-checks each anyway. There is no note on bulk sends, and a single request is capped at 100 cases. | One code path per email keeps the claim → send → finalize guarantees (cooldown under concurrency, honest failed status) with nothing new to get wrong. |
| 8 | **Attention flags:** `overdue`, `due_soon` (due within 7 days), `never_opened`, `email_failed`, `changes_requested`. They're derived from existing fields, with no schema change. | They answer "what should I look at first?" in one filter. |
| 9 | **List view:** cases are grouped into *Needs your review* → *Waiting on recipient* → *Complete* (collapsed in `<details>`); the status filter chips stay. Every blocking item is listed on its card (up to 5, then "+n more"), with the changes-requested reason. The main action matches the group: **Review** or **Send reminder**. | "Essentially what we have, a little more refined": the same data, organised as action items. |
| 10 | **The data table is a reusable component** (user request, mid-build) in `src/components/ui/data-table/`: `useDataTable` (the shared feature set + a typed column helper), `DataTable`, `DataTableColumnHeader`, `DataTablePagination`, `DataTableViewOptions`, `DataTableFacetedFilter`, `DataTableSearch`, `DataTableSelectionBar`, `createSelectColumn`. Following shadcn's architecture, the parts take the `table` instance; the page owns columns, filter rules and bulk actions. **New primitives** under them: `Checkbox` (M3, with an indeterminate state), `Popover` (disclosure panel: Escape and outside click close it, focus returns to the trigger), `IconButton` (M3 standard), and `ButtonLink` (Button styles on a Next `Link`, so we stop nesting `<button>` inside `<a>`). | The next table (templates, recipients, audit log) should be columns + a hook call, not another copy of sorting, pagination and selection markup. |
| 11 | **Eight columns by default, not ten.** Status and progress share one column (badge + "n of m accepted" + bar, sorted by status then least progress); recipient activity and last email share an **Activity** column. | Found in the browser pass: ten columns pushed the row actions off-screen at 1440px. The table view also widens the page to `max-w-7xl`. |

## 1. Pure domain — `src/lib/domain/dashboard-table.ts`
- `CaseTableRow`: `id, name, templateName, recipient{name, organization, email}|null, status, counts, blockingItems{title,state,reason}[], dueAt, createdAt, daysOpen, completedAt, lastActivity{label, at}|null, lastContact{kind: invite|reminder, status, at}|null, reminder (eligibility), flags`.
- `toCaseTableRow(row: DashboardCase, now)`.
- `CaseTableFilters { query, statuses, templates, flags }`, `filterCaseRows(rows, filters)`, `facetCounts(rows, filters)`. Each facet is counted over rows that match every *other* filter.
- `CaseTableState = CaseTableFilters & { sort: {id, desc}|null, page, pageSize }`, `parseCaseTableState(searchParams)`, `caseTableStateToSearchParams(state)` (defaults omitted).
- `TABLE_COLUMN_IDS`, `HIDEABLE_COLUMN_IDS`, `SORTABLE_COLUMN_IDS` (`name, recipient, status, outstanding, dueAt, activity, daysOpen, createdAt`).

## 2. Preferences — `src/lib/dashboard-prefs.ts`
- `DashboardView = 'table'|'list'`, `parseDashboardView` (defaults to `table`), `parseHiddenColumns` (defaults to `['daysOpen', 'createdAt']`, unknown ids dropped), the cookie names and `maxAge`.

## 3. Actions
- `src/app/(app)/dashboard/actions.ts`: `setDashboardViewAction(view)` sets the cookie and redirects to `/dashboard`.
- `src/app/(app)/cases/actions.ts`:
  - `sendReminderAction` accepts a hidden `returnQuery` (re-parsed through `parseCaseTableState` before reuse).
  - New `sendRemindersAction(formData)` (repeated `caseId`, `returnQuery`) → `/dashboard?notice=reminders_sent&sent=&skipped=&failed=`.
- `src/lib/domain/reminder.ts`: `sendManualReminders({workspaceId, userId, caseIds, now})`.

## 4. UI
- `dashboard/page.tsx` (server): reads both cookies, runs `listCases`, shows notices, renders the header with a `SegmentedButtons` view switcher (`view-switcher.tsx`, client) **next to New case**, then `CasesTable` or `CasesList`. The page and header are widened to `max-w-7xl` in table view.
- `dashboard/cases-list.tsx` (server): decision 9.
- `dashboard/cases-table.tsx` (client), composed from the reusable parts (decision 10):
  - Toolbar: search, Status/Template/Needs-attention facet chips (popover with checkboxes and counts; accessible names "Filter by …" so they never collide with a column's sort button), Clear filters, and a Columns popover.
  - Selection bar: "n selected", "Send reminder to k", Clear selection.
  - Table: sortable headers with `aria-sort`; Case (name + template), Recipient, Status (badge + progress), Outstanding, Due, Activity, Open for (hidden), Created (hidden), and a row action (Review / Remind).
  - Empty state for "no matches".
  - Footer: "Showing a–b of n", rows per page, page x of y, first/prev/next/last.
  - Horizontal scroll inside its own container on narrow screens (`relative`, so absolutely positioned sr-only labels can't widen the page).
- `components/ui/data-table/*`, `checkbox.tsx`, `popover.tsx`, `icon-button.tsx`, and `ButtonLink` in `button.tsx`; `filter-chip.tsx` exports `filterChipClassName`.
- `app-header.tsx`: a `wide` prop.

## 5. Tests
- Vitest `dashboard-table.test.ts`: row mapping and flags; search across name/recipient/email/organisation/template; facet OR/AND semantics; facet counts; URL state round trip; invalid values dropped.
- Vitest `dashboard-prefs.test.ts`: view and column parsing defaults.
- Vitest `reminder.test.ts`: `sendManualReminders` across three cases in one workspace (sent / refused as complete / notify failure).
- Playwright `e2e/stage8-6-dashboard-views.spec.ts`:
  1. The table is the default; search and the status facet filter rows; a hidden column stays hidden after reload.
  2. Switching to list survives reload and sign-out/sign-in; switching back works.
  3. Selecting two cases and sending reminders shows the bulk notice, and both rows show "Reminded".
- The existing stage 5/7 dashboard assertions must still pass against the table.

## 6. Docs
- `design-revised.md`: a new §55A "Data Tables" (anatomy, density, sorting, filtering, selection, pagination, responsive, accessibility, anti-patterns), plus Checkbox and Popover notes in the component inventory and final checklist.
- `CHECKLIST.md`: a Stage 8.6 section.

## Verification
`pnpm typecheck && pnpm lint && pnpm test`, `pnpm test:e2e` (all specs, in parallel), `pnpm build`, then a browser pass at desktop and 360px: facets, sorting, column toggle, selection, bulk send, view persistence, and no hydration warnings.
