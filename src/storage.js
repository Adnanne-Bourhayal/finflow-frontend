import { checkShares, makeLedger, parseAmount } from './ledger.js'

// Read-modify-write inside a single IndexedDB transaction serializes edits from other tabs.
let opened
function database() {
  if (!opened)
    opened = new Promise((resolve, reject) => {
      const req = indexedDB.open('finflow-workspaces', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('ledgers')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => {
        opened = undefined
        reject(
          Error(
            'Browser storage is unavailable. Allow site storage to use your ledger.',
          ),
        )
      }
    })
  return opened
}
async function change(key, edit) {
  const db = await database()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('ledgers', 'readwrite'),
      store = tx.objectStore('ledgers'),
      req = store.get(key)
    let result, caught
    req.onsuccess = () => {
      try {
        const ledger = req.result ?? makeLedger(key === 'example')
        result = edit ? edit(ledger) : ledger
        if (edit || !req.result) store.put(ledger, key)
      } catch (e) {
        caught = e
        tx.abort()
      }
    }
    tx.oncomplete = () => resolve(result)
    tx.onabort = () =>
      reject(caught ?? Error('The change could not be saved in this browser.'))
  })
}
export function localWorkspace(key) {
  return {
    async read(month) {
      const data = await change(key)
      return {
        categories: data.categories,
        shares: data.plans[month] || {},
        entries: data.entries.filter((e) => e.date.startsWith(month + '-')),
      }
    },
    async addCategory(name, type) {
      return change(key, (data) => {
        if (
          data.categories.some(
            (c) =>
              c.name.toLowerCase() === name.toLowerCase() && c.type === type,
          )
        )
          throw Error('That category already exists.')
        const id = 1 + Math.max(0, ...data.categories.map((c) => Number(c.id)))
        data.categories.push({ id, name, type })
        return id
      })
    },
    async addEntry(entry) {
      return change(key, (data) => {
        const cat = data.categories.find((c) => c.id === entry.category)
        if (!cat) throw Error('Choose an existing category.')
        data.entries.push({ ...entry, id: crypto.randomUUID(), type: cat.type })
      })
    },
    async remove(id) {
      return change(key, (data) => {
        data.entries = data.entries.filter((e) => e.id !== id)
      })
    },
    async savePlan(month, shares) {
      return change(key, (data) => {
        checkShares(shares, data.categories)
        data.plans[month] = shares
      })
    },
  }
}

// Only installations explicitly built with VITE_PRIVATE_API_URL offer a server connection.
// The workspace key stays in a closure in memory and is never included in a URL.
export function serverWorkspace(endpoint, key) {
  const base = new URL(endpoint)
  if (
    base.protocol !== 'https:' &&
    !(
      base.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)
    )
  )
    throw Error('Use HTTPS for remote ledgers.')
  if (base.username || base.password || base.search || base.hash)
    throw Error('Use a plain API URL.')
  async function api(path, method = 'GET', payload) {
    const res = await fetch(base.href.replace(/\/$/, '') + path, {
      method,
      headers: {
        Authorization: 'Bearer ' + key,
        ...(payload && { 'Content-Type': 'application/json' }),
      },
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      ...(payload && { body: JSON.stringify(payload) }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw Error(
        typeof data.detail === 'string'
          ? data.detail
          : 'The API could not save or load the requested data.',
      )
    }
    return res.status === 204 ? null : res.json()
  }
  return {
    async read(month) {
      const [categories, transactions, plan] = await Promise.all([
        api('/categories/'),
        api('/transactions/?month=' + month),
        api('/plans/' + month),
      ])
      return {
        categories,
        shares: plan.shares,
        entries: transactions.map((t) => ({
          id: t.id,
          date: t.transaction_date,
          type: t.category_type,
          category: t.category_id,
          label: t.description || t.category_name,
          cents: parseAmount(String(t.amount)),
        })),
      }
    },
    async addCategory(name, type) {
      return (await api('/categories/', 'POST', { name, type })).id
    },
    async addEntry(e) {
      return api('/transactions/', 'POST', {
        category_id: e.category,
        description: e.label,
        amount: (e.cents / 100).toFixed(2),
        transaction_date: e.date,
      })
    },
    async remove(id) {
      return api('/transactions/' + id, 'DELETE')
    },
    async savePlan(month, shares) {
      return api('/plans/' + month, 'PUT', { shares })
    },
  }
}
