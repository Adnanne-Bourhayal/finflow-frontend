import { useEffect, useMemo, useRef, useState } from 'react'
import {
  checkShares,
  localDate,
  money,
  monthlyReport,
  parseAmount,
  shiftMonth,
} from './ledger.js'
import { localWorkspace, serverWorkspace } from './storage.js'

const MONTH = new Intl.DateTimeFormat('en-IE', {
  month: 'long',
  year: 'numeric',
})
const DAY = new Intl.DateTimeFormat('en-IE', { day: 'numeric', month: 'short' })
const colors = ['#306c59', '#ba662e', '#7988aa', '#a67b91']
const monthName = (m) => MONTH.format(new Date(m + '-15T12:00:00'))

function Dialog({ title, close, children }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    el.showModal()
    return () => el.close()
  }, [])
  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
      aria-labelledby="dialog-title"
    >
      <header>
        <h2 id="dialog-title">{title}</h2>
        <button className="square" aria-label="Close dialog" onClick={close}>
          ×
        </button>
      </header>
      {children}
    </dialog>
  )
}

function EntryForm({ month, categories, save, newCategory, busy }) {
  const [type, setType] = useState('expense')
  const choices = categories.filter((c) => c.type === type)
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const f = new FormData(event.currentTarget)
        save(() => {
          const label = String(f.get('label')).trim()
          if (!label) throw Error('Enter a description for this entry.')
          return {
            label,
            date: f.get('date'),
            category: Number(f.get('category')),
            cents: parseAmount(String(f.get('amount'))),
          }
        })
      }}
    >
      <div className="segmented" role="group" aria-label="Entry type">
        {['expense', 'income'].map((item) => (
          <button
            type="button"
            aria-pressed={item === type}
            key={item}
            onClick={() => setType(item)}
          >
            {item === 'income' ? 'Income' : 'Expense'}
          </button>
        ))}
      </div>
      <label>
        Amount (€)
        <input
          required
          name="amount"
          inputMode="decimal"
          placeholder="0.00"
          autoFocus
        />
      </label>
      <label>
        Description
        <input
          required
          name="label"
          maxLength="120"
          placeholder={type === 'income' ? 'e.g. Salary' : 'e.g. Train pass'}
        />
      </label>
      <label>
        Category
        <select key={type} name="category" aria-label="Category" required>
          {choices.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {!choices.length && (
        <button
          type="button"
          className="text-button"
          onClick={() => newCategory(type)}
        >
          Create a category first
        </button>
      )}
      <label>
        Date
        <input
          type="date"
          required
          name="date"
          min={month + '-01'}
          max={localDate(
            new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0),
          )}
          defaultValue={
            localDate().startsWith(month) ? localDate() : month + '-01'
          }
        />
      </label>
      <button disabled={busy || !choices.length} className="primary">
        Save entry
      </button>
    </form>
  )
}

function PlanForm({ categories, shares, income, save, busy }) {
  const [draft, setDraft] = useState({ ...shares })
  const total = Object.values(draft).reduce((a, b) => a + Number(b), 0)
  const targets = new Map(
    monthlyReport(
      categories,
      [{ type: 'income', cents: income }],
      draft,
    ).rows.map((r) => [r.id, r.limit]),
  )
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save(draft)
      }}
    >
      <p>
        Allocate this month's income. Any percentage left over stays
        unallocated.
      </p>
      {categories
        .filter((c) => c.type === 'expense')
        .map((c) => (
          <label className="share-input" key={c.id}>
            <span>
              {c.name}
              <small>{money(targets.get(c.id))} of income</small>
            </span>
            <span>
              <input
                aria-label={c.name + ' percentage'}
                type="number"
                min="0"
                max="100"
                step="1"
                required
                value={draft[c.id] ?? 0}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    [c.id]: e.target.value === '' ? '' : Number(e.target.value),
                  })
                }
              />{' '}
              %
            </span>
          </label>
        ))}
      <div className="inline-info">
        <span>Unallocated</span>
        <strong>{100 - total}%</strong>
      </div>
      {total > 100 && <p role="alert">Reduce the total to 100% or less.</p>}
      <button className="primary" disabled={busy || total > 100}>
        Save allocation
      </button>
    </form>
  )
}

function Board({ workspace, mode, month }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(''),
    [revision, reload] = useState(0)
  const [dialog, setDialog] = useState(''),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(null)
  const channel = useRef(null),
    saving = useRef(false)
  useEffect(() => {
    if (!('BroadcastChannel' in window) || mode === 'server') return
    const bc = new BroadcastChannel('finflow-' + mode)
    channel.current = bc
    bc.onmessage = () => reload((n) => n + 1)
    return () => {
      channel.current = null
      bc.close()
    }
  }, [mode])
  useEffect(() => {
    let current = true
    workspace
      .read(month)
      .then((value) => {
        if (current) setData(value)
      })
      .catch((e) => {
        if (current) setError(e.message)
      })
    return () => {
      current = false
    }
  }, [workspace, month, revision])
  const close = () => {
    if (!saving.current) {
      setDialog('')
      setError('')
    }
  }
  const open = (name, item) => {
    setSelected(item)
    setError('')
    setDialog(name)
  }
  async function apply(action) {
    if (saving.current) return
    saving.current = true
    setBusy(true)
    setError('')
    try {
      await action()
      setDialog('')
      reload((n) => n + 1)
      channel.current?.postMessage('changed')
    } catch (e) {
      setError(e.message)
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  if (!data)
    return (
      <div role="status" className="loading">
        {error || 'Opening your ledger…'}{' '}
        {error && <button onClick={() => reload((n) => n + 1)}>Retry</button>}
      </div>
    )
  const { rows, income, expenses, balance, unallocated, unallocatedPercent } =
    monthlyReport(data.categories, data.entries, data.shares)
  const sorted = [...data.entries]
    .reverse()
    .sort((a, b) => b.date.localeCompare(a.date))
  const names = new Map(data.categories.map((c) => [c.id, c.name]))
  return (
    <>
      <section className="summary" aria-label="Monthly totals">
        <div className="balance">
          <span>Balance this month</span>
          <strong>{money(balance)}</strong>
        </div>
        <div className="minor">
          <span>Income</span>
          <strong>{money(income)}</strong>
        </div>
        <div className="minor">
          <span>Expenses</span>
          <strong>{money(expenses)}</strong>
        </div>
      </section>
      {error && !dialog && <p role="alert">{error}</p>}
      <div className="columns">
        <section className="card">
          <header>
            <h2>Monthly plan</h2>
            <button onClick={() => open('plan')}>Edit allocation</button>
          </header>
          <p className="muted">
            Spending targets are percentages of income recorded this month.
          </p>
          <div className="bar" aria-hidden="true">
            {rows.map((r, i) => (
              <span
                key={r.id}
                style={{
                  width: r.percent + '%',
                  background: colors[i % colors.length],
                }}
              />
            ))}
          </div>
          <ul className="budget-list">
            {rows.map((r, i) => (
              <li key={r.id}>
                <span
                  className="dot"
                  style={{ background: colors[i % colors.length] }}
                />
                <div className="grow">
                  <strong>{r.name}</strong>
                  <small>
                    {money(r.used)} spent of {money(r.limit)}
                  </small>
                </div>
                <div className="align-right">
                  <strong>{r.percent}%</strong>
                  {r.used > r.limit && (
                    <small className="over">
                      Over by {money(r.used - r.limit)}
                    </small>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="inline-info">
            <span>Unallocated ({unallocatedPercent}%)</span>
            <strong>{money(unallocated)}</strong>
          </div>
          <button
            className="text-button"
            onClick={() => open('category', 'expense')}
          >
            + New category
          </button>
        </section>
        <section className="card">
          <header>
            <h2>Entries</h2>
            <button className="primary" onClick={() => open('entry')}>
              + Add entry
            </button>
          </header>
          {sorted.length ? (
            <ul className="entry-list">
              {sorted.map((e) => (
                <li key={e.id}>
                  <div className={'entry-icon ' + e.type} aria-hidden="true">
                    {e.type === 'income' ? '↙' : '↗'}
                  </div>
                  <div className="grow">
                    <strong>{e.label}</strong>
                    <small>
                      {DAY.format(new Date(e.date + 'T12:00:00'))} ·{' '}
                      {names.get(e.category)}
                    </small>
                  </div>
                  <strong className={'amt ' + e.type}>
                    {e.type === 'income' ? '+' : '−'}
                    {money(e.cents)}
                  </strong>
                  <button
                    className="remove"
                    aria-label={'Delete ' + e.label}
                    onClick={() => open('delete', e)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">
              No entries for this month. Add income to start planning.
            </p>
          )}
        </section>
      </div>
      {dialog && (
        <Dialog
          title={
            {
              entry: 'Add entry',
              plan: 'Edit monthly allocation',
              category: 'New category',
              delete: 'Delete entry?',
            }[dialog]
          }
          close={close}
        >
          {dialog === 'entry' && (
            <EntryForm
              month={month}
              categories={data.categories}
              busy={busy}
              newCategory={(type) => open('category', type)}
              save={(make) => apply(() => workspace.addEntry(make()))}
            />
          )}
          {dialog === 'plan' && (
            <PlanForm
              categories={data.categories}
              shares={data.shares}
              income={income}
              busy={busy}
              save={(shares) =>
                apply(() => {
                  checkShares(shares, data.categories)
                  return workspace.savePlan(month, shares)
                })
              }
            />
          )}
          {dialog === 'category' && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const f = new FormData(e.currentTarget)
                apply(() => {
                  const name = String(f.get('name')).trim()
                  if (!name) throw Error('Enter a category name.')
                  return workspace.addCategory(name, f.get('type'))
                })
              }}
            >
              <label>
                Name
                <input name="name" required maxLength="60" autoFocus />
              </label>
              <label>
                Type
                <select name="type" aria-label="Type" defaultValue={selected}>
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </label>
              <button className="primary" disabled={busy}>
                Create category
              </button>
            </form>
          )}
          {dialog === 'delete' && (
            <>
              <p>
                {selected.label} · {money(selected.cents)}
              </p>
              <div className="actions">
                <button onClick={close}>Keep entry</button>
                <button
                  disabled={busy}
                  className="danger"
                  onClick={() => apply(() => workspace.remove(selected.id))}
                >
                  Delete entry
                </button>
              </div>
            </>
          )}
          {error && <p role="alert">{error}</p>}
        </Dialog>
      )}
    </>
  )
}

export default function App() {
  const [mode, setMode] = useState(() => {
    try {
      return window.localStorage.getItem('finflow-view') === 'personal'
        ? 'personal'
        : 'example'
    } catch {
      return 'example'
    }
  })
  const [month, setMonth] = useState(localDate().slice(0, 7)),
    [server, setServer] = useState(null),
    [conn, setConn] = useState(false),
    [err, setErr] = useState('')
  function choose(next) {
    setMode(next)
    setServer(null)
    try {
      window.localStorage.setItem('finflow-view', next)
    } catch {
      /* IndexedDB handles a storage failure explicitly. */
    }
  }
  const workspace = useMemo(
    () => (mode === 'server' ? server : localWorkspace(mode)),
    [server, mode],
  )
  return (
    <main>
      <nav aria-label="Workspace">
        <span className="brand">
          <b aria-hidden="true">F</b> FinFlow
        </span>
        <div
          className="mode segmented"
          role="group"
          aria-label="Choose a ledger"
        >
          <button
            aria-pressed={mode === 'example'}
            onClick={() => choose('example')}
          >
            Example
          </button>
          <button
            aria-pressed={mode === 'personal'}
            onClick={() => choose('personal')}
          >
            My ledger
          </button>
          {import.meta.env.VITE_PRIVATE_API_URL && (
            <button
              aria-pressed={mode === 'server'}
              onClick={() => {
                setErr('')
                setConn(true)
              }}
            >
              Private API
            </button>
          )}
        </div>
      </nav>
      <section className="heading">
        <div>
          <h1>
            Monthly budget<span>.</span>
          </h1>
          <p>
            {mode === 'example'
              ? 'Explore with sample entries. Edits stay in this browser.'
              : mode === 'personal'
                ? 'Your ledger is saved in this browser on this device.'
                : 'Connected to your private ledger.'}
          </p>
        </div>
        <div className="month">
          <button
            className="square"
            aria-label="Previous month"
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            ‹
          </button>
          <strong>{monthName(month)}</strong>
          <button
            className="square"
            aria-label="Next month"
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            ›
          </button>
        </div>
      </section>
      <Board
        key={mode + month}
        mode={mode}
        month={month}
        workspace={workspace}
      />
      {conn && (
        <Dialog title="Open private ledger" close={() => setConn(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              try {
                const w = serverWorkspace(
                  import.meta.env.VITE_PRIVATE_API_URL,
                  new FormData(e.currentTarget).get('key'),
                )
                await w.read(month)
                setServer(w)
                setMode('server')
                setConn(false)
              } catch (e) {
                setErr(e.message)
              }
            }}
          >
            <p>The key stays in memory for this session.</p>
            <label>
              Workspace key
              <input
                name="key"
                type="password"
                required
                autoComplete="off"
                autoFocus
              />
            </label>
            <button className="primary">Connect</button>
            {err && <p role="alert">{err}</p>}
          </form>
        </Dialog>
      )}
    </main>
  )
}
