import { filterPayments, parseFilters, sortPayments } from "@/data/queries"
import {
  exportFilename,
  exportScopeLabel,
  parseExportOptions,
  toCsv,
} from "@/lib/csv"
import { NextRequest, NextResponse } from "next/server"

/**
 * Exports the payments table as CSV.
 *
 * Ops chooses the columns and the scope (NWP-101). Both are validated by
 * `parseExportOptions` before anything is read. Rows come from the same query
 * builder as `GET /api/payments`, unpaginated, so the file holds every
 * matching payment rather than the page on screen.
 *
 * - `scope=filtered` (default): honors status, merchant, search, and dates.
 * - `scope=all`: ignores the filters but keeps the requested sort.
 * - `columns=a,b,c`: allowlisted names; defaults exclude card last four.
 */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const options = parseExportOptions(params)
  if (!options.ok) {
    return NextResponse.json({ error: options.error }, { status: 400 })
  }

  const filters = parseFilters(params)
  const scoped =
    options.scope === "all"
      ? parseFilters(new URLSearchParams())
      : filters
  const rows = sortPayments(
    filterPayments(scoped),
    filters.sort,
    filters.direction,
  )
  const filename = exportFilename(
    new Date(),
    exportScopeLabel(options.scope, filters),
  )

  return new Response(toCsv(rows, options.columns), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  })
}
