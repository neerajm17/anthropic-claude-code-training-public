"use client"

import { Button } from "@/components/Button"
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/Drawer"
import {
  DEFAULT_EXPORT_COLUMNS,
  EXPORT_COLUMNS,
  ExportColumn,
  ExportScope,
} from "@/lib/csv"
import { Download } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

const COLUMN_LABELS: Record<ExportColumn, string> = {
  id: "Payment ID",
  created_at: "Created (UTC)",
  merchant: "Merchant",
  description: "Description",
  status: "Status",
  method: "Method",
  card_brand: "Card brand",
  last4: "Card last four",
  amount: "Amount",
  currency: "Currency",
}

const SCOPES: { value: ExportScope; label: string; hint: string }[] = [
  {
    value: "filtered",
    label: "Current filter",
    hint: "Every payment matching the filters on this page, not just this page of results.",
  },
  { value: "all", label: "All payments", hint: "Ignores the filters." },
]

type Counts = Partial<Record<ExportScope, number | "error">>

/**
 * Export options for the payments table (NWP-101).
 *
 * The browser only chooses options. Validation, filtering, and serialization
 * happen in `GET /api/payments/export`; the row counts come from
 * `GET /api/payments`, so both use the same query builder.
 *
 * `filterQuery` is the current URL query without `page`.
 */
export function ExportDialog({ filterQuery }: { filterQuery: string }) {
  const [open, setOpen] = useState(false)
  const [columns, setColumns] = useState<ExportColumn[]>([
    ...DEFAULT_EXPORT_COLUMNS,
  ])
  const [scope, setScope] = useState<ExportScope>("filtered")
  const [counts, setCounts] = useState<Counts>({})

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const load = async (key: ExportScope, query: string) => {
      try {
        const response = await fetch(`/api/payments?${query}`, {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(String(response.status))
        const body: { total: number } = await response.json()
        setCounts((previous) => ({ ...previous, [key]: body.total }))
      } catch (error) {
        if (controller.signal.aborted) return
        setCounts((previous) => ({ ...previous, [key]: "error" }))
      }
    }
    setCounts({})
    load("filtered", filterQuery)
    load("all", "")
    return () => controller.abort()
  }, [open, filterQuery])

  const href = useMemo(() => {
    const query = new URLSearchParams(filterQuery)
    query.set("scope", scope)
    query.set("columns", columns.join(","))
    return `/api/payments/export?${query.toString()}`
  }, [filterQuery, scope, columns])

  const toggle = (column: ExportColumn, checked: boolean) =>
    setColumns((previous) =>
      // The server writes columns in the order sent; the dialog always sends
      // the canonical order so the file layout is predictable.
      EXPORT_COLUMNS.filter((c) =>
        c === column ? checked : previous.includes(c),
      ),
    )

  const nothingSelected = columns.length === 0
  const count = counts[scope]

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button variant="secondary" className="w-full gap-2 py-1.5 sm:w-fit">
          <Download
            className="-ml-0.5 size-4 shrink-0 text-gray-400 dark:text-gray-600"
            aria-hidden="true"
          />
          Export
        </Button>
      </DrawerTrigger>
      <DrawerContent className="sm:max-w-md">
        <DrawerHeader>
          <DrawerTitle>Export payments</DrawerTitle>
          <DrawerDescription>
            Choose what goes into the CSV before you download it.
          </DrawerDescription>
        </DrawerHeader>

        <DrawerBody className="flex flex-col gap-6">
          <fieldset>
            <legend className="text-sm font-medium text-gray-900 dark:text-gray-50">
              Scope
            </legend>
            <div className="mt-2 flex flex-col gap-2">
              {SCOPES.map((option) => {
                const optionCount = counts[option.value]
                return (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-start gap-3 rounded-md border border-gray-200 p-3 text-sm has-[:checked]:border-blue-500 dark:border-gray-800"
                  >
                    <input
                      type="radio"
                      name="export-scope"
                      value={option.value}
                      checked={scope === option.value}
                      onChange={() => setScope(option.value)}
                      className="mt-0.5 accent-blue-600"
                    />
                    <span className="flex flex-col">
                      <span className="font-medium text-gray-900 dark:text-gray-50">
                        {option.label}
                        <span className="ml-2 font-normal tabular-nums text-gray-500">
                          {optionCount === undefined
                            ? "counting…"
                            : optionCount === "error"
                              ? "count unavailable"
                              : `${optionCount.toLocaleString()} payments`}
                        </span>
                      </span>
                      <span className="text-gray-500">{option.hint}</span>
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          <fieldset>
            {/* The legend stays the fieldset's first child so it names the group. */}
            <legend className="float-left text-sm font-medium text-gray-900 dark:text-gray-50">
              Columns
            </legend>
            <div className="flex justify-end gap-1">
              <Button
                type="button"
                variant="ghost"
                className="px-2 py-0.5 text-xs"
                onClick={() => setColumns([...DEFAULT_EXPORT_COLUMNS])}
              >
                Defaults
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="px-2 py-0.5 text-xs"
                onClick={() => setColumns([])}
              >
                Clear
              </Button>
            </div>
            <div className="clear-both mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {EXPORT_COLUMNS.map((column) => (
                <label
                  key={column}
                  className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
                >
                  <input
                    type="checkbox"
                    name="export-columns"
                    value={column}
                    checked={columns.includes(column)}
                    onChange={(event) => toggle(column, event.target.checked)}
                    className="size-4 accent-blue-600"
                  />
                  {COLUMN_LABELS[column]}
                </label>
              ))}
            </div>
            {columns.includes("last4") && (
              <p className="mt-3 rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-400/10 dark:text-amber-400">
                This file will include card last four. Remove it before sending
                the file to a merchant.
              </p>
            )}
          </fieldset>
        </DrawerBody>

        <DrawerFooter className="items-center gap-2">
          <p
            role="status"
            className="mr-auto text-sm text-gray-500 max-sm:mt-2"
          >
            {nothingSelected
              ? "Select at least one column."
              : typeof count === "number"
                ? `${count.toLocaleString()} rows × ${columns.length} columns`
                : ""}
          </p>
          <DrawerClose asChild>
            <Button variant="secondary" className="py-1.5">
              Cancel
            </Button>
          </DrawerClose>
          {nothingSelected ? (
            <Button className="gap-2 py-1.5" disabled>
              <Download className="size-4" aria-hidden="true" />
              Download CSV
            </Button>
          ) : (
            <Button className="gap-2 py-1.5" asChild>
              <a href={href} download onClick={() => setOpen(false)}>
                <Download className="size-4" aria-hidden="true" />
                Download CSV
              </a>
            </Button>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
