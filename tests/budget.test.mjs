import test from 'node:test'
import assert from 'node:assert/strict'
import {
  checkShares,
  makeLedger,
  monthlyReport,
  parseAmount,
  shiftMonth,
} from '../src/ledger.js'
const { categories } = makeLedger()
test('cents add exactly and percentages cannot double-allocate a cent', () => {
  assert.equal(parseAmount('0,11') + parseAmount('1.29'), 140)
  assert.throws(() => parseAmount('0.001'))
  const result = monthlyReport(categories, [{ type: 'income', cents: 1 }], {
    2: 50,
    3: 50,
  })
  assert.equal(
    result.rows.reduce((a, r) => a + r.limit, 0),
    1,
  )
  assert.equal(result.unallocated, 0)
})
test('category type is explicit, including translated category names', () => {
  const result = monthlyReport(
    [{ id: 5, name: 'Transporte', type: 'expense' }],
    [{ category: 5, cents: 2510, type: 'expense' }],
    {},
  )
  assert.equal(result.expenses, 2510)
  assert.equal(result.balance, -2510)
  assert.equal(result.rows[0].used, 2510)
})
test('only valid spending categories with at most 100% are accepted', () => {
  assert.throws(() => checkShares({ 2: 80, 3: 21 }, categories))
  assert.throws(() => checkShares({ 1: 20 }, categories))
  assert.throws(() => checkShares({ 2: 10.1 }, categories))
  assert.throws(() => checkShares({ 2: -1 }, categories))
  checkShares({ 2: 80, 3: 20 }, categories)
})
test('monthly allocation and previous and next year transitions', () => {
  const d = makeLedger(true, '2026-12'),
    r = monthlyReport(d.categories, d.entries, d.plans['2026-12'])
  assert.equal(r.income, 260000)
  assert.equal(r.unallocated, 52000)
  assert.equal(r.expenses, 103200)
  assert.equal(shiftMonth('2026-12', 1), '2027-01')
  assert.equal(shiftMonth('2026-01', -1), '2025-12')
})
