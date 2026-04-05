import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

const apiClient = axios.create({
  baseURL: API_URL,
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

export default apiClient
