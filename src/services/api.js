import axios from 'axios'

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
})

export const getSummary = async () => {
  const response = await apiClient.get('/dashboard/summary')
  const data = response.data
  return {
    ...data,
    total_income: parseFloat(data.total_income),
    total_expenses: parseFloat(data.total_expenses),
    net_balance: parseFloat(data.net_balance),
  }
}

export const getExpensesByCategory = async () => {
  const response = await apiClient.get('/dashboard/expenses-by-category')
  return response.data.map((item) => ({
    ...item,
    total_amount: parseFloat(item.total_amount),
  }))
}

export const getTransactions = async () => {
  const response = await apiClient.get('/transactions/')
  return response.data.map((tx) => ({
    ...tx,
    amount: parseFloat(tx.amount),
    transaction_date: new Date(tx.transaction_date),
  }))
}

export const getCategories = async () => {
  const response = await apiClient.get('/categories/')
  return response.data
}

export const createCategory = async (payload) => {
  const response = await apiClient.post('/categories/', payload)
  return response.data
}

export const createTransaction = async (payload) => {
  const response = await apiClient.post('/transactions/', payload)
  return response.data
}

export const getBudgetStatus = async () => {
  const response = await apiClient.get('/budgets/status')
  return response.data.map((item) => ({
    ...item,
    monthly_limit: parseFloat(item.monthly_limit),
    spent: parseFloat(item.spent),
    remaining: parseFloat(item.remaining),
    percentage_used: parseFloat(item.percentage_used),
  }))
}

export const createBudget = async (payload) => {
  const response = await apiClient.post('/budgets/', payload)
  return response.data
}

export default apiClient
