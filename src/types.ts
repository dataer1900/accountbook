export type TransactionType = 'income' | 'expense'
export type ReimbursementStatus = 'unsubmitted' | 'submitted' | 'reimbursed'

export type TransactionRecord = {
  id: string
  type: TransactionType
  amount: number
  category: string
  date: string
  note: string
  reimbursable: boolean
  reimbursementStatus: ReimbursementStatus
  createdAt: string
  updatedAt: string
}

export type TransactionInput = {
  type: TransactionType
  amount: number
  category: string
  date: string
  note: string
  reimbursable: boolean
}

export type StoredBookkeepingData = {
  version: 1
  records: TransactionRecord[]
}

export type SourceUtterance = {
  id: string
  text: string
  createdAt: string
}

export type CategoryConfig = {
  income: string[]
  expense: string[]
}

export type BookkeepingFilesResponse = {
  ok: true
  recordsMarkdown: string
  sourceMarkdown: string
  categoryConfig: CategoryConfig
  recordsPath: string
  sourcePath: string
  categoryPath: string
}

export type CategorySummary = {
  category: string
  total: number
  percentage: number
  count: number
}

export type MonthlyBillChartPoint = {
  date: string
  day: number
  incomeTotal: number
  expenseTotal: number
  balance: number
  recordCount: number
  expensePercentage: number
}

export type MonthlyReportData = {
  month: string
  records: TransactionRecord[]
  incomeTotal: number
  expenseTotal: number
  balance: number
  incomeCategories: CategorySummary[]
  expenseCategories: CategorySummary[]
  billChart: MonthlyBillChartPoint[]
}

export type AiConfigStatus = {
  ok: true
  configured: boolean
  provider: string
  baseUrl: string
  baseUrlConfigured: boolean
  apiKeyConfigured: boolean
  model: string
  timeoutMs: number
  source: 'env' | 'local-file' | 'none'
}

export type AiConfigInput = {
  provider: string
  baseUrl: string
  model: string
  apiKey: string
  timeoutMs: number
}

export type AiConfigUpdateResponse = AiConfigStatus | AiParseRecordErrorResponse

export type AiParseRecordRequest = {
  text: string
  defaultDate: string
  locale: 'zh-CN'
  categories: CategoryConfig
}

export type AiParseRecordSuccessResponse = {
  ok: true
  records: TransactionInput[]
  record?: TransactionInput
  confidence: number
  warnings: string[]
}

export type AiParseRecordErrorResponse = {
  ok: false
  code: string
  message: string
}

export type AiParseRecordResponse = AiParseRecordSuccessResponse | AiParseRecordErrorResponse
