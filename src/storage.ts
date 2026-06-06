import { getBookkeepingFiles, saveBookkeepingFiles } from './aiClient'
import type {
  BookkeepingFilesResponse,
  CategoryConfig,
  ReimbursementStatus,
  SourceUtterance,
  TransactionInput,
  TransactionRecord,
} from './types'

let fileCache: BookkeepingFilesResponse | null = null

function normalizeRecord(value: unknown): TransactionRecord | null {
  if (!value || typeof value !== 'object') return null

  const record = value as Partial<TransactionRecord>
  if (
    typeof record.id !== 'string' ||
    (record.type !== 'income' && record.type !== 'expense') ||
    typeof record.amount !== 'number' ||
    !Number.isFinite(record.amount) ||
    record.amount <= 0 ||
    typeof record.category !== 'string' ||
    typeof record.date !== 'string' ||
    typeof record.note !== 'string' ||
    typeof record.createdAt !== 'string' ||
    typeof record.updatedAt !== 'string'
  ) {
    return null
  }

  return {
    id: record.id,
    type: record.type,
    amount: normalizeAmount(record.amount),
    category: record.category,
    date: record.date,
    note: record.note,
    reimbursable: record.reimbursable === true,
    reimbursementStatus: normalizeReimbursementStatus(record.reimbursementStatus, record.reimbursable === true),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

function normalizeRecords(records: unknown[]) {
  return records.map(normalizeRecord).filter((record): record is TransactionRecord => Boolean(record))
}

function makeId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function normalizeAmount(amount: number) {
  return Math.round(Number(amount) * 100) / 100
}

function normalizeReimbursementStatus(status: unknown, reimbursable: boolean): ReimbursementStatus {
  if (!reimbursable) return 'unsubmitted'
  if (status === 'reimbursed') return 'reimbursed'
  if (status === 'submitted') return 'submitted'
  return 'unsubmitted'
}

export async function loadBookkeepingData() {
  fileCache = await getBookkeepingFiles()
  return {
    records: parseRecordsFromMarkdown(fileCache.recordsMarkdown),
    utterances: parseSourceUtterancesFromMarkdown(fileCache.sourceMarkdown),
    categoryConfig: fileCache.categoryConfig,
    paths: {
      recordsPath: fileCache.recordsPath,
      sourcePath: fileCache.sourcePath,
      categoryPath: fileCache.categoryPath,
    },
  }
}

export async function saveBookkeepingData(
  records: TransactionRecord[],
  utterances: SourceUtterance[],
  categoryConfig: CategoryConfig,
) {
  const nextFiles = await saveBookkeepingFiles({
    recordsMarkdown: exportRecordsAsMarkdown(records),
    sourceMarkdown: exportSourceUtterancesAsMarkdown(utterances),
    categoryConfig,
  })

  fileCache = nextFiles
  return nextFiles
}

export function appendSourceUtterance(currentUtterances: SourceUtterance[], text: string) {
  const trimmed = text.trim()
  if (!trimmed) return currentUtterances

  return [
    {
      id: makeId(),
      text: trimmed,
      createdAt: new Date().toISOString(),
    },
    ...currentUtterances,
  ]
}

export function addCategoryToConfig(categoryConfig: CategoryConfig, type: 'income' | 'expense', category: string) {
  const nextCategory = category.trim()
  if (!nextCategory) return categoryConfig

  const list = type === 'income' ? categoryConfig.income : categoryConfig.expense
  if (list.includes(nextCategory)) return categoryConfig

  return {
    ...categoryConfig,
    [type]: [...list, nextCategory],
  }
}

export function exportSourceUtterancesAsMarkdown(utterances: SourceUtterance[]) {
  const rows = utterances.map((utterance) => markdownRow([utterance.id, utterance.text, utterance.createdAt]))

  return [
    '# 小账本原始语料',
    '',
    `导出时间：${new Date().toLocaleString('zh-CN')}`,
    '',
    `- 语料条数：${utterances.length}`,
    '',
    '| ID | 原始输入 | 创建时间 |',
    '| --- | --- | --- |',
    ...rows,
    '',
  ].join('\n')
}

export function parseSourceUtterancesFromMarkdown(raw: string): SourceUtterance[] {
  const rows = parseMarkdownTable(raw, ['原始输入'])
  return rows
    .map((row) =>
      normalizeSourceUtterance({
        id: row.ID || row.id || makeId(),
        text: row.原始输入 || row.text || '',
        createdAt: row.创建时间 || row.createdAt || new Date().toISOString(),
      }),
    )
    .filter((item): item is SourceUtterance => Boolean(item))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

function normalizeSourceUtterance(value: unknown): SourceUtterance | null {
  if (!value || typeof value !== 'object') return null

  const utterance = value as Partial<SourceUtterance>
  if (typeof utterance.id !== 'string' || typeof utterance.text !== 'string' || typeof utterance.createdAt !== 'string') {
    return null
  }

  return {
    id: utterance.id,
    text: utterance.text,
    createdAt: utterance.createdAt,
  }
}

export function createRecord(input: TransactionInput): TransactionRecord {
  const now = new Date().toISOString()

  return {
    id: makeId(),
    ...input,
    amount: normalizeAmount(input.amount),
    note: input.note.trim().slice(0, 100),
    reimbursementStatus: 'unsubmitted',
    createdAt: now,
    updatedAt: now,
  }
}

export function updateRecord(record: TransactionRecord, input: TransactionInput): TransactionRecord {
  return {
    ...record,
    ...input,
    amount: normalizeAmount(input.amount),
    note: input.note.trim().slice(0, 100),
    reimbursementStatus: input.reimbursable ? record.reimbursementStatus : 'unsubmitted',
    updatedAt: new Date().toISOString(),
  }
}

export function deleteRecord(records: TransactionRecord[], recordId: string) {
  return records.filter((record) => record.id !== recordId)
}

export function updateReimbursementStatus(
  records: TransactionRecord[],
  recordId: string,
  reimbursementStatus: ReimbursementStatus,
) {
  return records.map((record): TransactionRecord => {
    if (record.id !== recordId) return record
    if (!record.reimbursable) {
      return {
        ...record,
        reimbursementStatus: 'unsubmitted',
      }
    }

    return {
      ...record,
      reimbursementStatus,
      updatedAt: new Date().toISOString(),
    }
  })
}

export function exportRecordsAsMarkdown(records: TransactionRecord[]) {
  const sortedRecords = [...records].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt))
  const incomeTotal = sortedRecords.filter((record) => record.type === 'income').reduce((sum, record) => sum + record.amount, 0)
  const expenseTotal = sortedRecords.filter((record) => record.type === 'expense').reduce((sum, record) => sum + record.amount, 0)

  const rows = sortedRecords.map((record) =>
    markdownRow([
      record.id,
      record.date,
      record.type === 'income' ? '收入' : '支出',
      record.category,
      record.amount.toFixed(2),
      record.reimbursable ? '是' : '否',
      record.reimbursable
        ? record.reimbursementStatus === 'reimbursed'
          ? '已报销'
          : record.reimbursementStatus === 'submitted'
            ? '已提交'
            : '未提交'
        : '-',
      record.note || '-',
      record.createdAt,
      record.updatedAt,
    ]),
  )

  return [
    '# 小账本记录',
    '',
    `导出时间：${new Date().toLocaleString('zh-CN')}`,
    '',
    `- 记录数：${sortedRecords.length}`,
    `- 总收入：¥${incomeTotal.toFixed(2)}`,
    `- 总支出：¥${expenseTotal.toFixed(2)}`,
    `- 结余：¥${(incomeTotal - expenseTotal).toFixed(2)}`,
    '',
    '| ID | 日期 | 类型 | 分类 | 金额 | 是否可以报销 | 报销状态 | 备注 | 创建时间 | 更新时间 |',
    '| --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n')
}

function markdownRow(values: string[]) {
  return `| ${values.map(escapeMarkdownCell).join(' | ')} |`
}

function escapeMarkdownCell(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

function unescapeMarkdownCell(value: string) {
  return value.trim().replace(/\\\|/g, '|').replace(/\\\\/g, '\\')
}

export function parseImportedRecords(raw: string): { records: TransactionRecord[] } | { error: string } {
  const rows = parseMarkdownTable(raw, ['日期', '类型', '分类', '金额'])
  const now = new Date().toISOString()
  const records = normalizeRecords(
    rows.map((row) => ({
      id: row.ID || row.id || makeId(),
      type: parseRecordType(row.类型),
      amount: parseAmount(row.金额),
      category: row.分类 || '',
      date: row.日期 || '',
      note: row.备注 && row.备注 !== '-' ? row.备注 : '',
      reimbursable: parseReimbursable(row.是否可以报销),
      reimbursementStatus: parseReimbursementStatus(row.报销状态, row.是否可以报销),
      createdAt: row.创建时间 || now,
      updatedAt: row.更新时间 || row.创建时间 || now,
    })),
  )

  if (!records.length) {
    return { error: '没有找到有效的 Markdown 账单记录。' }
  }

  return { records }
}

function parseRecordsFromMarkdown(raw: string) {
  const parsed = parseImportedRecords(raw)
  if ('error' in parsed) return []
  return parsed.records
}

function parseMarkdownTable(raw: string, requiredHeaders: string[]) {
  const lines = raw.split(/\r?\n/)
  const headerIndex = lines.findIndex((line) => {
    const cells = splitMarkdownRow(line)
    return requiredHeaders.every((header) => cells.includes(header))
  })

  if (headerIndex === -1) return []

  const headers = splitMarkdownRow(lines[headerIndex])
  const rows: Record<string, string>[] = []

  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.trim().startsWith('|')) break

    const cells = splitMarkdownRow(line)
    if (!cells.length) continue

    const row: Record<string, string> = {}
    headers.forEach((header, index) => {
      row[header] = cells[index] || ''
    })
    rows.push(row)
  }

  return rows
}

function splitMarkdownRow(line: string) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  const cells: string[] = []
  let current = ''
  let escaping = false

  for (const char of trimmed) {
    if (escaping) {
      current += `\\${char}`
      escaping = false
      continue
    }

    if (char === '\\') {
      escaping = true
      continue
    }

    if (char === '|') {
      cells.push(unescapeMarkdownCell(current))
      current = ''
      continue
    }

    current += char
  }

  if (escaping) current += '\\'
  cells.push(unescapeMarkdownCell(current))

  return cells
}

function parseRecordType(value: string) {
  return value === '收入' || value === 'income' ? 'income' : 'expense'
}

function parseAmount(value: string) {
  return normalizeAmount(Number(value.replace(/[¥,\s]/g, '')))
}

function parseReimbursable(value: string) {
  return ['是', 'true', '可报销', '可以'].includes(value.trim().toLowerCase())
}

function parseReimbursementStatus(value: string, reimbursableValue: string) {
  if (!parseReimbursable(reimbursableValue || '')) return 'unsubmitted'
  if (value.trim() === '已报销') return 'reimbursed'
  if (value.trim() === '已提交') return 'submitted'
  return 'unsubmitted'
}

export function mergeRecords(existing: TransactionRecord[], imported: TransactionRecord[]) {
  const recordMap = new Map<string, TransactionRecord>()

  for (const record of existing) {
    recordMap.set(record.id, record)
  }

  for (const record of imported) {
    const current = recordMap.get(record.id)
    if (!current || record.updatedAt.localeCompare(current.updatedAt) > 0) {
      recordMap.set(record.id, record)
    }
  }

  return Array.from(recordMap.values()).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt))
}
