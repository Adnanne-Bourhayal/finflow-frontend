# FinFlow

[Open the monthly budget](https://finflowbeta.vercel.app).

FinFlow helps you assign a percentage of each month's income to spending categories, record expenses and see what remains. For example, with €2,000 income and 50% for essentials, your target is €1,000. Record €600 of essentials and you have €400 left in that category. Change the month to begin a separate plan.

## Use it

- **Example** opens a synthetic ledger you can edit. **My ledger** starts with empty books. Entries in these workspaces are stored separately in IndexedDB in this browser.
- Choose **Add entry**, enter income or an expense, the amount, category and date. **New category** lets you name your own income or expense groups.
- Choose **Edit allocation** and assign whole percentages totalling up to 100. Unallocated income is the part you haven't assigned. Balance is actual income minus actual expenses. An overspent category shows how far it is over.
- Entries and allocations persist on this browser and device. Clearing site data deletes them. Anyone using the same browser profile can open them. The public app sends no ledger entries to a server.

## Run it locally

Requires Node.js 22.12+ or a current LTS release.

```sh
npm ci
npm run dev
npm test
npm run lint
npm run build
```

React renders the month view and uses the same report calculations for local and self-hosted ledgers. `src/ledger.js` calculates money in cents. Percentage targets use cumulative rounding so a cent cannot be assigned twice. `src/storage.js` serializes local edits with IndexedDB write transactions.

### Optional personal server

The default site works without a backend or credentials. To use your own [FastAPI ledger](https://github.com/Adnanne-Bourhayal/finflow-backend-minimal), set the **public API address only** in `VITE_PRIVATE_API_URL` at build time (for example `http://127.0.0.1:8000/api/v1` for a local installation). Set the frontend origin on the API. **Private API** then prompts for your server key, kept in memory until the page is reloaded or another ledger is selected. It never belongs in a Vite variable or Git. Start by creating income and expense categories in the empty server ledger.

Deploy the default site as a static Vite app. The build output is `dist/`. The old `/login` and `/app/*` routes also open the budget when served with the included Vercel configuration.
