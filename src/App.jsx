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
const budgetGuide =
  'https://files.consumerfinance.gov/f/documents/201606_cfpb_rules-to-live-by_my-spending-rule-to-live-by.pdf'
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

function EntryForm({
  month,
  categories,
  save,
  newCategory,
  busy,
  initialType,
}) {
  const [type, setType] = useState(initialType)
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

function Board({ workspace, mode, month, changeMonth }) {
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
      <header className="heading">
        <div>
          <h1>Monthly budget</h1>
          <p>
            {mode === 'example'
              ? 'Explore a sample budget or open your own ledger.'
              : !income
                ? 'Start by adding the take-home income you received this month.'
                : 'Record expenses and compare them with your plan.'}
          </p>
        </div>
        <div className="month" role="group" aria-label="Choose month">
          <button aria-label="Previous month" onClick={() => changeMonth(-1)}>
            ‹
          </button>
          <strong>{monthName(month)}</strong>
          <button aria-label="Next month" onClick={() => changeMonth(1)}>
            ›
          </button>
        </div>
      </header>
      <section className="summary" aria-label="Monthly totals">
        <div className="balance">
          <span>Balance this month</span>
          <strong>{money(balance)}</strong>
        </div>
        <div>
          <span>Income</span>
          <strong>{money(income)}</strong>
        </div>
        <div>
          <span>Expenses</span>
          <strong>{money(expenses)}</strong>
        </div>
      </section>
      {error && !dialog && <p role="alert">{error}</p>}
      <div
        className={
          mode !== 'example' && !income ? 'columns income-first' : 'columns'
        }
      >
        <section className="panel plan">
          <header>
            <h2>Monthly plan</h2>
            <button onClick={() => open('plan')}>Edit allocation</button>
          </header>
          <p className="guide">
            Targets use this month's recorded income. (A starting split for
            take-home pay is 50% for all needs including rent, up to 30% for
            wants, and 20% for savings and debt payments.){' '}
            <a href={budgetGuide} target="_blank" rel="noreferrer">
              CFPB guide
            </a>
          </p>
          <table className="budget-list">
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col">Target</th>
                <th scope="col">Spent</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row">
                    {row.name}
                    <small>{row.percent}% of income</small>
                  </th>
                  <td>{money(row.limit)}</td>
                  <td className={row.used > row.limit ? 'over' : undefined}>
                    {money(row.used)}
                    {row.used > row.limit && (
                      <small>Over by {money(row.used - row.limit)}</small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
        <section className="panel activity">
          <header>
            <h2>Entries</h2>
            <button
              className={mode === 'example' ? undefined : 'primary'}
              onClick={() => open('entry', income ? 'expense' : 'income')}
            >
              + {income ? 'Add entry' : 'Add income'}
            </button>
          </header>
          {sorted.length ? (
            <ul className="entry-list">
              {sorted.map((entry) => (
                <li key={entry.id}>
                  <div className="grow">
                    <strong>{entry.label}</strong>
                    <small>
                      {DAY.format(new Date(entry.date + 'T12:00:00'))} ·{' '}
                      {names.get(entry.category)}
                    </small>
                  </div>
                  <span className={'amt ' + entry.type}>
                    {entry.type === 'income' ? '+' : '−'}
                    {money(entry.cents)}
                  </span>
                  <button
                    className="remove"
                    aria-label={'Delete ' + entry.label}
                    onClick={() => open('delete', entry)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">
              Your entries for {monthName(month)} will appear here.
            </p>
          )}
        </section>
      </div>
      <footer>
        {mode === 'server'
          ? 'Connected to your private ledger.'
          : mode === 'example'
            ? 'Sample data · edits stay in this browser.'
            : 'Your ledger is saved in this browser on this device.'}
      </footer>
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
              initialType={selected}
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
        <div className="identity">
          <span className="brand">
            <img src="/favicon.svg" alt="" width="28" height="28" />
            FinFlow
          </span>
          <span className="current-ledger">
            {mode === 'example'
              ? 'Example ledger'
              : mode === 'personal'
                ? 'My ledger'
                : 'Private API'}
          </span>
        </div>
        <div className="workspace-actions">
          {mode !== 'personal' && (
            <button className="primary" onClick={() => choose('personal')}>
              Open my ledger
            </button>
          )}
          {mode !== 'example' && (
            <button onClick={() => choose('example')}>View example</button>
          )}
          {import.meta.env.VITE_PRIVATE_API_URL && mode !== 'server' && (
            <button
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
      <Board
        key={mode + month}
        mode={mode}
        month={month}
        workspace={workspace}
        changeMonth={(direction) =>
          setMonth((current) => shiftMonth(current, direction))
        }
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
