import type { TransactionRecord } from './types'

export function getCurrentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function getToday() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function shiftMonth(month: string, offset: number) {
  const [year, monthIndex] = month.split('-').map(Number)
  const date = new Date(year, monthIndex - 1 + offset, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function formatMonth(month: string) {
  const [year, monthIndex] = month.split('-')
  return `${year}年${Number(monthIndex)}月`
}

export function isRecordInMonth(record: TransactionRecord, month: string) {
  return record.date.startsWith(month)
}

export function sortRecordsByDate(records: TransactionRecord[]) {
  return [...records].sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date)
    return dateCompare === 0 ? b.updatedAt.localeCompare(a.updatedAt) : dateCompare
  })
}

export function formatDateTime(value: string) {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return value
  }
}
