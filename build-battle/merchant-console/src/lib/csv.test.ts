import { describe, expect, it } from "vitest"
import { Payment } from "@/data/types"
import {
  DEFAULT_EXPORT_COLUMNS,
  EXPORT_COLUMNS,
  exportFilename,
  exportScopeLabel,
  parseExportOptions,
  toCsv,
} from "./csv"

/**
 * The export is the file ops hands to a merchant, so a broken cell is a
 * support ticket rather than a stack trace. These tests pin the escaping and
 * the column contract; NWP-101 changes which columns ship, not how a cell is
 * written, and these should still pass afterwards.
 */

const payment: Payment = {
  id: "pay_0001",
  merchantId: "mch_01",
  amount: 25000,
  currency: "USD",
  status: "captured",
  method: "card",
  cardBrand: "visa",
  last4: "4242",
  createdAt: "2026-03-14T10:15:00.000Z",
  description: "Order 1180",
}

describe("toCsv", () => {
  it("writes a header row followed by one row per payment", () => {
    const lines = toCsv([payment]).split("\n")
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe(EXPORT_COLUMNS.join(","))
  })

  it("writes only the requested columns, in the order given", () => {
    expect(toCsv([payment], ["id", "amount"])).toBe(
      ["id,amount", "pay_0001,$250.00"].join("\n"),
    )
  })

  it("quotes cells containing a comma, so amounts do not split", () => {
    const large = { ...payment, amount: 123456789 }
    expect(toCsv([large], ["amount"])).toBe(['amount', '"$1,234,567.89"'].join("\n"))
  })

  it("doubles embedded quotes rather than dropping them", () => {
    const quoted = { ...payment, description: 'Order "rush"' }
    expect(toCsv([quoted], ["description"])).toBe(
      ["description", '"Order ""rush"""'].join("\n"),
    )
  })

  it("keeps a newline inside a description in one quoted cell", () => {
    const multiline = { ...payment, description: "Order 1180\nsecond line" }
    const body = toCsv([multiline], ["description"]).split("\n").slice(1).join("\n")
    expect(body).toBe('"Order 1180\nsecond line"')
  })

  it("resolves the merchant name, and falls back to the id when unknown", () => {
    expect(toCsv([payment], ["merchant"])).toContain("Lumen Coffee Roasters")
    const orphan = { ...payment, merchantId: "mch_missing" }
    expect(toCsv([orphan], ["merchant"])).toContain("mch_missing")
  })

  it("writes an empty cell for a payment with no card", () => {
    const bank: Payment = {
      ...payment,
      method: "bank_transfer",
      cardBrand: null,
      last4: null,
    }
    expect(toCsv([bank], ["card_brand", "last4"])).toBe(
      ["card_brand,last4", ","].join("\n"),
    )
  })

  it("emits a header even with no rows", () => {
    expect(toCsv([], ["id"])).toBe("id")
  })
})

describe("exportFilename", () => {
  it("stamps the UTC date, so two exports on the same day collide by design", () => {
    expect(exportFilename(new Date("2026-03-14T23:00:00.000Z"))).toBe(
      "payments-2026-03-14.csv",
    )
  })

  it("puts the scope between the prefix and the date", () => {
    expect(exportFilename(new Date("2026-08-13T12:00:00.000Z"), "disputed")).toBe(
      "payments-disputed-2026-08-13.csv",
    )
  })
})

describe("default export columns", () => {
  it("leaves card last four out, so merchant files are clean by default", () => {
    expect(DEFAULT_EXPORT_COLUMNS).not.toContain("last4")
    expect(DEFAULT_EXPORT_COLUMNS).toEqual(
      EXPORT_COLUMNS.filter((column) => column !== "last4"),
    )
  })

  it("serializes the default set without the card number", () => {
    const [header, row] = toCsv([payment], DEFAULT_EXPORT_COLUMNS).split("\n")
    expect(header.split(",")).not.toContain("last4")
    expect(row).not.toContain("4242")
  })

  it("keeps the amount formatted once with its currency in its own column", () => {
    expect(toCsv([payment], ["amount", "currency"])).toBe(
      ["amount,currency", "$250.00,USD"].join("\n"),
    )
  })
})

describe("parseExportOptions", () => {
  const parse = (query: string) => parseExportOptions(new URLSearchParams(query))

  it("defaults to the current filter and the default columns", () => {
    expect(parse("")).toEqual({
      ok: true,
      scope: "filtered",
      columns: [...DEFAULT_EXPORT_COLUMNS],
    })
  })

  it("accepts an explicit column list and drops duplicates", () => {
    expect(parse("columns=amount,id,amount&scope=all")).toEqual({
      ok: true,
      scope: "all",
      columns: ["amount", "id"],
    })
  })

  it("lets ops opt in to card last four", () => {
    const options = parse("columns=id,last4")
    expect(options.ok && options.columns).toEqual(["id", "last4"])
  })

  it("rejects a column that is not on the allowlist", () => {
    expect(parse("columns=id,merchantId").ok).toBe(false)
    expect(parse("columns=__proto__").ok).toBe(false)
  })

  it("rejects an empty column list rather than writing an empty file", () => {
    expect(parse("columns=").ok).toBe(false)
    expect(parse("columns=,,").ok).toBe(false)
  })

  it("rejects an unknown scope", () => {
    expect(parse("scope=everything").ok).toBe(false)
  })
})

describe("exportScopeLabel", () => {
  it("labels an all-payments export 'all' whatever the filters say", () => {
    expect(exportScopeLabel("all", { status: "disputed" })).toBe("all")
  })

  it("uses the status for a filtered export", () => {
    expect(exportScopeLabel("filtered", { status: "disputed" })).toBe("disputed")
  })

  it("includes a merchant only when it exists", () => {
    expect(exportScopeLabel("filtered", { status: "captured", merchantId: "mch_01" })).toBe(
      "captured-mch-01",
    )
    expect(
      exportScopeLabel("filtered", { merchantId: '"; evil=1' }),
    ).toBe("all")
  })

  it("never puts free-text search into the filename", () => {
    expect(exportScopeLabel("filtered", { search: "../../etc" })).toBe("filtered")
  })

  it("labels an unfiltered current view 'all'", () => {
    expect(exportScopeLabel("filtered", { status: "all" })).toBe("all")
  })
})

describe("column selection (NWP-101)", () => {
  const parse = (query: string) => parseExportOptions(new URLSearchParams(query))

  it("exports a subset of columns in the order requested", () => {
    const options = parse("columns=amount,id,status")
    expect(options.ok && options.columns).toEqual(["amount", "id", "status"])
    if (!options.ok) throw new Error(options.error)
    expect(toCsv([payment], options.columns)).toBe(
      ["amount,id,status", "$250.00,pay_0001,captured"].join("\n"),
    )
  })

  it("excludes card last four when no columns are chosen", () => {
    const options = parse("")
    if (!options.ok) throw new Error(options.error)
    expect(options.columns).not.toContain("last4")
    const [header, row] = toCsv([payment], options.columns).split("\n")
    expect(header.split(",")).not.toContain("last4")
    expect(row).not.toContain("4242")
  })

  it("refuses an empty selection with a message ops can act on", () => {
    expect(parse("columns=")).toEqual({
      ok: false,
      error: "Choose at least one column to export.",
    })
  })
})
