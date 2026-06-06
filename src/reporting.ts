import { isRecordInMonth, sortRecordsByDate } from './dateUtils'
import type { CategorySummary, MonthlyBillChartPoint, MonthlyReportData, TransactionRecord, TransactionType } from './types'

export type DailyRecordGroup = {
  date: string
  records: TransactionRecord[]
  incomeTotal: number
  expenseTotal: number
}

function getTotal(records: TransactionRecord[], type: TransactionType) {
  return records
    .filter((record) => record.type === type)
    .reduce((sum, record) => sum + record.amount, 0)
}

function getCategorySummary(records: TransactionRecord[], type: TransactionType, total: number): CategorySummary[] {
  const categoryMap = records
    .filter((record) => record.type === type)
    .reduce<Map<string, { total: number; count: number }>>((map, record) => {
      const current = map.get(record.category) ?? { total: 0, count: 0 }
      map.set(record.category, {
        total: current.total + record.amount,
        count: current.count + 1,
      })
      return map
    }, new Map())

  return Array.from(categoryMap, ([category, value]) => ({
    category,
    total: value.total,
    count: value.count,
    percentage: total > 0 ? Math.round((value.total / total) * 100) : 0,
  })).sort((a, b) => b.total - a.total)
}

function createMonthlyBillChart(records: TransactionRecord[], month: string): MonthlyBillChartPoint[] {
  const [year, monthIndex] = month.split('-').map(Number)
  const daysInMonth = new Date(year, monthIndex, 0).getDate()

  const points = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1
    const date = `${year}-${String(monthIndex).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const dayRecords = records.filter((record) => record.date === date)
    const incomeTotal = getTotal(dayRecords, 'income')
    const expenseTotal = getTotal(dayRecords, 'expense')

    return {
      date,
      day,
      incomeTotal,
      expenseTotal,
      balance: incomeTotal - expenseTotal,
      recordCount: dayRecords.length,
      expensePercentage: 0,
    }
  })

  const maxDailyExpense = Math.max(...points.map((point) => point.expenseTotal), 0)

  return points.map((point) => ({
    ...point,
    expensePercentage: maxDailyExpense > 0 ? Math.round((point.expenseTotal / maxDailyExpense) * 100) : 0,
  }))
}

export function createMonthlyReport(records: TransactionRecord[], month: string): MonthlyReportData {
  const monthlyRecords = sortRecordsByDate(records.filter((record) => isRecordInMonth(record, month)))
  const incomeTotal = getTotal(monthlyRecords, 'income')
  const expenseTotal = getTotal(monthlyRecords, 'expense')

  return {
    month,
    records: monthlyRecords,
    incomeTotal,
    expenseTotal,
    balance: incomeTotal - expenseTotal,
    incomeCategories: getCategorySummary(monthlyRecords, 'income', incomeTotal),
    expenseCategories: getCategorySummary(monthlyRecords, 'expense', expenseTotal),
    billChart: createMonthlyBillChart(monthlyRecords, month),
  }
}

export function groupRecordsByDate(records: TransactionRecord[]): DailyRecordGroup[] {
  const groups = sortRecordsByDate(records).reduce<Map<string, TransactionRecord[]>>((map, record) => {
    map.set(record.date, [...(map.get(record.date) ?? []), record])
    return map
  }, new Map())

  return Array.from(groups, ([date, groupRecords]) => ({
    date,
    records: groupRecords,
    incomeTotal: getTotal(groupRecords, 'income'),
    expenseTotal: getTotal(groupRecords, 'expense'),
  })).sort((a, b) => b.date.localeCompare(a.date))
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 2,
  }).format(amount)
}

export function getReimbursementSummary(records: TransactionRecord[]) {
  const reimbursableRecords = records.filter((record) => record.reimbursable)
  const unsubmittedRecords = reimbursableRecords.filter((record) => record.reimbursementStatus === 'unsubmitted')
  const submittedRecords = reimbursableRecords.filter((record) => record.reimbursementStatus === 'submitted')
  const reimbursedRecords = reimbursableRecords.filter((record) => record.reimbursementStatus === 'reimbursed')

  return {
    unsubmittedRecords,
    submittedRecords,
    reimbursedRecords,
    unsubmittedTotal: unsubmittedRecords.reduce((sum, record) => sum + record.amount, 0),
    submittedTotal: submittedRecords.reduce((sum, record) => sum + record.amount, 0),
    reimbursedTotal: reimbursedRecords.reduce((sum, record) => sum + record.amount, 0),
  }
}
