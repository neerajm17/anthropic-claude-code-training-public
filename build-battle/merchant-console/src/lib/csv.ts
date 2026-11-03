import { merchantById } from "@/data/merchants"
import { Payment, PaymentFilters } from "@/data/types"
import { formatMoney } from "./money"

/**
 * CSV export for the payments table.
 *
 * Ops chooses the columns and the scope (NWP-101). Column names and scope
 * arrive from the client, so they are checked against the allowlists below
 * before they reach the serializer or the filename.
 */

export const EXPORT_COLUMNS = [
  "id",
  "created_at",
  "merchant",
  "description",
  "status",
  "method",
  "card_brand",
  "last4",
  "amount",
  "currency",
] as const

export type ExportColumn = (typeof EXPORT_COLUMNS)[number]

/** Card last four is opt-in: files that go to a merchant must not carry it. */
export const DEFAULT_EXPORT_COLUMNS: readonly ExportColumn[] =
  EXPORT_COLUMNS.filter((column) => column !== "last4")

export const EXPORT_SCOPES = ["filtered", "all"] as const

export type ExportScope = (typeof EXPORT_SCOPES)[number]

export type ExportOptions =
  | { ok: true; columns: ExportColumn[]; scope: ExportScope }
  | { ok: false; error: string }

function isExportColumn(value: string): value is ExportColumn {
  return (EXPORT_COLUMNS as readonly string[]).includes(value)
}

/**
 * Validate the export options from a query string.
 *
 * `columns` is a comma-separated list. When absent, the defaults apply; when
 * present, every name must be on the allowlist and at least one must be
 * given. Columns are written in the order the client sent them, so ops can
 * match a merchant's or Finance's template; duplicates keep their first
 * position.
 */
export function parseExportOptions(params: URLSearchParams): ExportOptions {
  const rawScope = params.get("scope") ?? "filtered"
  if (!(EXPORT_SCOPES as readonly string[]).includes(rawScope)) {
    return { ok: false, error: "Scope must be \"filtered\" or \"all\"." }
  }
  const scope = rawScope as ExportScope

  const rawColumns = params.get("columns")
  if (rawColumns === null) {
    return { ok: true, columns: [...DEFAULT_EXPORT_COLUMNS], scope }
  }

  const requested = rawColumns
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
  if (requested.length === 0) {
    return { ok: false, error: "Choose at least one column to export." }
  }
  const unknown = requested.filter((name) => !isExportColumn(name))
  if (unknown.length > 0) {
    return { ok: false, error: "Unknown export column requested." }
  }

  const columns = [...new Set(requested)] as ExportColumn[]
  return { ok: true, columns, scope }
}

function escapeCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function cell(payment: Payment, column: ExportColumn): string {
  switch (column) {
    case "id":
      return payment.id
    case "created_at":
      return payment.createdAt
    case "merchant":
      return merchantById(payment.merchantId)?.name ?? payment.merchantId
    case "description":
      return payment.description
    case "status":
      return payment.status
    case "method":
      return payment.method
    case "card_brand":
      return payment.cardBrand ?? ""
    case "last4":
      return payment.last4 ?? ""
    case "amount":
      return formatMoney(payment.amount, payment.currency)
    case "currency":
      return payment.currency
  }
}

export function toCsv(
  payments: Payment[],
  columns: readonly ExportColumn[] = EXPORT_COLUMNS,
): string {
  const header = columns.join(",")
  const rows = payments.map((payment) =>
    columns.map((column) => escapeCell(cell(payment, column))).join(","),
  )
  return [header, ...rows].join("\n")
}

/**
 * The scope part of an export filename, built only from allowlisted values:
 * the parsed status, a merchant id that exists, "filtered", or "all".
 *
 * Search text, dates, and unknown merchant ids never reach the filename, but
 * they still narrow the rows, so they add "filtered" rather than letting a
 * subset be named "all".
 */
export function exportScopeLabel(
  scope: ExportScope,
  filters: PaymentFilters = {},
): string {
  if (scope === "all") return "all"

  const parts: string[] = []
  if (filters.status && filters.status !== "all") parts.push(filters.status)
  const knownMerchant =
    filters.merchantId !== undefined && merchantById(filters.merchantId)
  if (knownMerchant) parts.push(filters.merchantId!.replace(/_/g, "-"))

  const narrowedOtherwise = Boolean(
    filters.search?.trim() ||
      filters.from ||
      filters.to ||
      (filters.merchantId && !knownMerchant),
  )
  if (narrowedOtherwise) parts.push("filtered")
  return parts.length > 0 ? parts.join("-") : "all"
}

/** `payments-<scope>-<UTC date>.csv`, e.g. `payments-disputed-2026-08-13.csv`. */
export function exportFilename(date = new Date(), scopeLabel?: string): string {
  const day = date.toISOString().slice(0, 10)
  return scopeLabel ? `payments-${scopeLabel}-${day}.csv` : `payments-${day}.csv`
}
