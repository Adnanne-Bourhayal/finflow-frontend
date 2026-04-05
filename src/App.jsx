import Header from './components/Header'
import SummaryCards from './components/SummaryCards'
import RecentTransactions from './components/RecentTransactions'
import ExpensesByCategory from './components/ExpensesByCategory'
import './index.css'

function App() {
  return (
    <div className="app-shell">
      <Header />
      <SummaryCards />
      <div className="content-grid">
        <div className="left-column">
          <RecentTransactions />
        </div>
        <div className="right-column">
          <ExpensesByCategory />
        </div>
      </div>
    </div>
  )
}

export default App
