// Keep values in integer euro cents so adding entries never accumulates float error.
export const money = (cents) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(
    cents / 100,
  )
export function localDate(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}
export function shiftMonth(month, direction) {
  const [y, m] = month.split('-').map(Number)
  return localDate(new Date(y, m - 1 + direction, 1)).slice(0, 7)
}
export function parseAmount(raw) {
  if (!/^\d{1,9}([.,]\d{1,2})?$/.test(raw))
    throw Error('Enter a positive euro amount with up to two decimal places.')
  const [whole, fraction = ''] = raw.replace(',', '.').split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (cents === 0) throw Error('The amount must be greater than zero.')
  return cents
}
export function checkShares(shares, categories) {
  const allowed = new Set(
    categories.filter((c) => c.type === 'expense').map((c) => String(c.id)),
  )
  const entries = Object.entries(shares)
  if (
    entries.some(
      ([id, n]) => !allowed.has(id) || !Number.isInteger(n) || n < 0 || n > 100,
    )
  ) {
    throw Error(
      'Use whole percentages between 0 and 100 for expense categories.',
    )
  }
  if (entries.reduce((acc, [, n]) => acc + n, 0) > 100)
    throw Error('Your allocations add up to more than 100%.')
}
export function monthlyReport(categories, entries, shares) {
  const spent = new Map()
  let income = 0,
    expenses = 0
  for (const entry of entries) {
    if (entry.type === 'income') income += entry.cents
    else {
      expenses += entry.cents
      spent.set(
        String(entry.category),
        (spent.get(String(entry.category)) || 0) + entry.cents,
      )
    }
  }
  let pct = 0,
    allocated = 0
  const rows = categories
    .filter((c) => c.type === 'expense')
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map((c) => {
      const percent = shares[c.id] || 0
      pct += percent
      // Round cumulative targets; adjacent categories can never allocate the same cent twice.
      const target = Math.round((income * pct) / 100)
      const limit = target - allocated
      allocated = target
      return { ...c, percent, limit, used: spent.get(String(c.id)) || 0 }
    })
  return {
    income,
    expenses,
    balance: income - expenses,
    unallocated: income - allocated,
    unallocatedPercent: 100 - pct,
    rows,
  }
}
export function makeLedger(example = false, month = localDate().slice(0, 7)) {
  const categories = [
    { id: 1, name: 'Income', type: 'income' },
    { id: 2, name: 'Essentials', type: 'expense' },
    { id: 3, name: 'Lifestyle', type: 'expense' },
    { id: 4, name: 'Travel', type: 'expense' },
  ]
  const tx = (id, category, label, cents, day) => ({
    id,
    category,
    label,
    cents,
    date: month + '-' + day,
    type: categories[category - 1].type,
  })
  return {
    categories,
    plans: example ? { [month]: { 2: 50, 3: 20, 4: 10 } } : {},
    entries: example
      ? [
          tx('s1', 1, 'Monthly salary', 260000, '01'),
          tx('s2', 2, 'Rent and utilities', 92000, '02'),
          tx('s3', 3, 'Dinner with friends', 6400, '03'),
          tx('s4', 4, 'Train pass', 4800, '04'),
        ]
      : [],
  }
}
