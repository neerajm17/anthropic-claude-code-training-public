import { describe, expect, it } from "vitest"
import { sortPayments } from "./queries"
import { Payment } from "./types"

/**
 * Amounts are integer minor units. Sorting them as strings puts $100.00
 * (10000) before $90.00 (9000); these pin numeric order for the table and
 * the export, which share this sort.
 */

const at = (id: string, amount: number): Payment => ({
  id,
  merchantId: "mch_01",
  amount,
  currency: "USD",
  status: "captured",
  method: "card",
  cardBrand: "visa",
  last4: "4242",
  createdAt: "2026-03-14T10:15:00.000Z",
  description: "Order",
})

const payments = [at("a", 10000), at("b", 9000), at("c", 125), at("d", 100000)]

describe("sortPayments by amount", () => {
  it("orders ascending by value, not by digits", () => {
    expect(sortPayments(payments, "amount", "asc").map((p) => p.amount)).toEqual([
      125, 9000, 10000, 100000,
    ])
  })

  it("orders descending by value", () => {
    expect(sortPayments(payments, "amount", "desc").map((p) => p.amount)).toEqual([
      100000, 10000, 9000, 125,
    ])
  })

  it("does not reorder the caller's array", () => {
    const before = payments.map((p) => p.id)
    sortPayments(payments, "amount", "asc")
    expect(payments.map((p) => p.id)).toEqual(before)
  })
})
