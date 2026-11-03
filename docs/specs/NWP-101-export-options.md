# SPEC · NWP-101 — Payments export: choose columns and scope

> Written before any code. Generated with `/spec`, then edited by a human.
> Load it as context when you build: `@docs/specs/NWP-101-export-options.md`

**Ticket:** [NWP-101](../tickets/NWP-101.md)
**Author:** neerajm17 (with Claude Code)
**Status:** building

## Problem

Ops exports payments several times a day, but the export is all-or-nothing: every column, current filter only. Card last-four ships in every file, so anything going to a merchant is hand-edited first — 3–4 hours a month for Dana's team, plus a near-miss where an unedited file almost went to the wrong merchant.

## Current state

All paths are relative to `build-battle/merchant-console/`.

- `src/app/api/payments/export/route.ts` — `GET` handler. Runs `parseFilters` → `filterPayments` → `sortPayments` and returns `toCsv(rows)` with every column. It does not paginate, so the server already exports the full filtered set rather than one page.
- `src/data/queries.ts` — the one query builder: `parseFilters` (allowlist for status/sort/direction), `filterPayments`, `sortPayments`, `queryPayments` (filter + sort + paginate, returns `total`). `GET /api/payments` (`src/app/api/payments/route.ts`) returns `queryPayments(filters)`, including `total`.
- `src/lib/csv.ts` — `EXPORT_COLUMNS` (10 columns, `last4` included), `toCsv(payments, columns)` already supports a column subset, `exportFilename(date)` returns `payments-YYYY-MM-DD.csv` with no scope.
- `src/lib/csv.test.ts` — escaping and column-order tests; the ticket says to extend this file.
- `src/lib/money.ts` — `formatMoney(minorUnits, currency)`, used by `toCsv` for the `amount` cell. `currency` is already its own column.
- `src/app/payments/page.tsx:68-76` — Export is a plain `<a href="/api/payments/export?…">`; there is no options UI.
- `src/components/` has **no `Dialog`** even though `.claude/rules/components.md` lists one. `Drawer.tsx` is a Radix Dialog (`@radix-ui/react-dialog`) with title, description, focus trap, and Escape handling. There is no checkbox component.
- **Found along the way:** `sortPayments` (`src/data/queries.ts:79-82`) sorts `amount` with `String(...).localeCompare`, so `9000` sorts above `10000`. This affects the table and the export whenever `sort=amount`.
- `parseFilters` passes `merchantId` and `search` through unvalidated. That's fine for an in-memory `filter`, but neither may reach a filename.

## Domain rules

| Rule | Source | What breaks if ignored |
| --- | --- | --- |
| "Money is integer minor units… Format once, at the edge, next to its currency code." | `merchant-console/CLAUDE.md` | Rounding drift, unreadable files |
| "One query builder. Payment filtering goes through the builder behind `GET /api/payments`." | `merchant-console/CLAUDE.md` | Export and table disagree |
| "Anything from the client — column names… — is checked against an allowlist before it reaches a query, a filename, or the store." | `merchant-console/CLAUDE.md` | Header injection, arbitrary fields leaking |
| "Column names arrive from the client, so validate them server-side." | Ticket | Same |
| "Building this in the browser exports the current page only." | Ticket | Ships the bug instead of the feature |
| "Card last-four is off by default." | Ticket | Merchant files leak card data |

## Approach

The server stays the source of truth. `src/lib/csv.ts` gains `DEFAULT_EXPORT_COLUMNS` (every column except `last4`), `parseExportOptions(params)` (validates `columns` against `EXPORT_COLUMNS` and `scope` against `filtered | all`, returning an error for unknown or empty input), and `exportFilename` takes a scope label built only from allowlisted values (status, known merchant id, or `all`). The export route returns 400 with a JSON message on invalid options. On the client, the Export button opens a Drawer with column checkboxes and a scope radio group. The row count comes from `GET /api/payments` (`total`), called with the current filters or with none, so the count and the file come from the same builder. Download is a link to the export route and is disabled when no columns are selected.

**Considered and rejected:** building the CSV in the browser from table rows. It only sees the current page (the bug the ticket warns about), and it puts column validation on the client. I also considered a new `/count` endpoint, but `GET /api/payments` already returns `total`.

## File map

| File | Add or change | Why |
| --- | --- | --- |
| `src/lib/csv.ts` | change | Default columns, option parsing/validation, scope-aware filename |
| `src/lib/csv.test.ts` | change | Cover the serializer defaults, validation, and filename |
| `src/app/api/payments/export/route.ts` | change | Apply validated columns and scope; 400 on bad input |
| `src/app/payments/export-dialog.tsx` | add | Client options panel (Drawer) |
| `src/app/payments/page.tsx` | change | Replace the bare link with the options panel |
| `src/data/queries.ts` | change | Numeric amount sort (the bug found along the way) |
| `src/data/queries.test.ts` | add | Pin the amount sort |

## Plan

1. **Serializer and validation in `csv.ts` + tests.** Done when: `npm test` passes with new cases for default columns, unknown/empty columns, scope, and filename.
2. **Export route uses the options.** Done when: `curl` with `columns=id,amount&scope=all` returns two columns and every row; `columns=evil` returns 400; there is no `last4` by default.
3. **Options panel on `/payments`.** Done when: the Export button opens a panel, last-four is unchecked, the count updates per scope, and Download is disabled with nothing selected.
4. **Amount sort fix + test.** Done when: the `queries.test.ts` amount-ordering test passes.

## Verification

| Acceptance criterion | How it is proven |
| --- | --- |
| Choose columns; last-four off by default | `csv.test.ts` (`DEFAULT_EXPORT_COLUMNS` excludes `last4`); curl without `columns` has no `last4`; checkbox unchecked in the screenshot |
| Scope current/all, count visible before download | Panel shows "N payments" for each scope, matching `total` from `/api/payments`; curl `scope=all` row count = store size |
| Filename reflects scope and date | `csv.test.ts` — `payments-disputed-2026-08-13.csv`, `payments-all-…`; `content-disposition` header from curl |
| Minor units internally, formatted once, currency column | `toCsv` formats via `formatMoney` only in `cell()`; existing `$250.00` + `currency` tests still pass |
| No columns → Download disabled | Panel screenshot with everything unchecked; server also returns 400 for empty `columns` |

## Risks

- CSV formula injection (cells starting `=`, `+`, `-`, `@`) is not handled today. Changing that alters how cells are written, which the ticket and `csv.test.ts` keep out of scope. It's flagged for the reviewer.
- The `/payments` page builds its own `PaymentFilters` instead of calling `parseFilters` (`src/app/payments/page.tsx:36-43`). The panel passes the same URL params to both APIs, so the count and the file agree with each other, even if the page itself drifts.

## Out of scope

- Persistence (NWP-203), the daily-totals bug (NWP-102), and date-range filter UI.

## Open questions

- Should the amount cell stay symbol-formatted (`$250.00`) or become a plain decimal (`250.00`)? I'm keeping `$250.00` because existing tests pin it and `currency` is already its own column.
