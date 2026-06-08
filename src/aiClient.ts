import {
  createDefaultRecordsMarkdown,
  createDefaultSourceMarkdown,
  DEFAULT_CATEGORY_CONFIG,
  LOCAL_STORAGE_LABELS,
} from './bookkeepingDefaults'
import { getToday } from './dateUtils'
import type {
  AiConfigInput,
  AiConfigStatus,
  AiConfigUpdateResponse,
  AiParseRecordErrorResponse,
  AiParseRecordResponse,
  AiParseRecordSuccessResponse,
  BookkeepingFilesResponse,
  CategoryConfig,
  TransactionInput,
} from './types'

const STORAGE_KEYS = {
  recordsMarkdown: 'bookkeeping.recordsMarkdown.v1',
  sourceMarkdown: 'bookkeeping.sourceMarkdown.v1',
  categoryConfig: 'bookkeeping.categoryConfig.v1',
  aiConfig: 'bookkeeping.aiConfig.v1',
}

export const DEFAULT_AI_BASE_URL = 'https://api.deepseek.com/chat/completions'
export const DEFAULT_AI_MODEL = 'deepseek-v4-flash'

type StoredAiConfig = {
  provider: string
  baseUrl: string
  model: string
  apiKey: string
  timeoutMs: number
}

export type AiExportConfigSnapshot = {
  exportedAt: string
  categoryConfig: CategoryConfig
  aiConfig: StoredAiConfig
  prompt: string
}

export type AiImportConfigSnapshot = {
  exportedAt?: string
  categoryConfig?: CategoryConfig
  aiConfig?: Partial<StoredAiConfig>
}

function hasBrowserStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function normalizeCategoryConfig(value: unknown): CategoryConfig {
  const income = Array.isArray((value as CategoryConfig | null)?.income)
    ? (value as CategoryConfig).income.map((item) => item.trim()).filter(Boolean)
    : DEFAULT_CATEGORY_CONFIG.income
  const expense = Array.isArray((value as CategoryConfig | null)?.expense)
    ? (value as CategoryConfig).expense.map((item) => item.trim()).filter(Boolean)
    : DEFAULT_CATEGORY_CONFIG.expense

  return {
    income: income.length ? Array.from(new Set(income)) : DEFAULT_CATEGORY_CONFIG.income,
    expense: expense.length ? Array.from(new Set(expense)) : DEFAULT_CATEGORY_CONFIG.expense,
  }
}

function loadLocalBookkeepingFiles(): BookkeepingFilesResponse {
  const recordsMarkdown = hasBrowserStorage()
    ? window.localStorage.getItem(STORAGE_KEYS.recordsMarkdown) || createDefaultRecordsMarkdown()
    : createDefaultRecordsMarkdown()
  const sourceMarkdown = hasBrowserStorage()
    ? window.localStorage.getItem(STORAGE_KEYS.sourceMarkdown) || createDefaultSourceMarkdown()
    : createDefaultSourceMarkdown()

  let categoryConfig = DEFAULT_CATEGORY_CONFIG
  if (hasBrowserStorage()) {
    const raw = window.localStorage.getItem(STORAGE_KEYS.categoryConfig)
    if (raw) {
      try {
        categoryConfig = normalizeCategoryConfig(JSON.parse(raw))
      } catch {
        categoryConfig = DEFAULT_CATEGORY_CONFIG
      }
    }
  }

  return {
    ok: true,
    recordsMarkdown,
    sourceMarkdown,
    categoryConfig,
    recordsPath: LOCAL_STORAGE_LABELS.recordsPath,
    sourcePath: LOCAL_STORAGE_LABELS.sourcePath,
    categoryPath: LOCAL_STORAGE_LABELS.categoryPath,
  }
}

function saveLocalBookkeepingFiles(input: {
  recordsMarkdown: string
  sourceMarkdown: string
  categoryConfig: CategoryConfig
}): BookkeepingFilesResponse {
  const categoryConfig = normalizeCategoryConfig(input.categoryConfig)

  if (hasBrowserStorage()) {
    window.localStorage.setItem(STORAGE_KEYS.recordsMarkdown, input.recordsMarkdown)
    window.localStorage.setItem(STORAGE_KEYS.sourceMarkdown, input.sourceMarkdown)
    window.localStorage.setItem(STORAGE_KEYS.categoryConfig, JSON.stringify(categoryConfig))
  }

  return {
    ok: true,
    recordsMarkdown: input.recordsMarkdown,
    sourceMarkdown: input.sourceMarkdown,
    categoryConfig,
    recordsPath: LOCAL_STORAGE_LABELS.recordsPath,
    sourcePath: LOCAL_STORAGE_LABELS.sourcePath,
    categoryPath: LOCAL_STORAGE_LABELS.categoryPath,
  }
}

function getDefaultAiConfig(): StoredAiConfig {
  return {
    provider: 'openai-compatible',
    baseUrl: DEFAULT_AI_BASE_URL,
    model: DEFAULT_AI_MODEL,
    apiKey: '',
    timeoutMs: 20000,
  }
}

function loadLocalAiConfig(): StoredAiConfig {
  if (!hasBrowserStorage()) return getDefaultAiConfig()

  const raw = window.localStorage.getItem(STORAGE_KEYS.aiConfig)
  if (!raw) return getDefaultAiConfig()

  try {
    const parsed = JSON.parse(raw) as Partial<StoredAiConfig>
    return {
      provider: parsed.provider === 'openai-compatible' ? parsed.provider : 'openai-compatible',
      baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : '',
      model: typeof parsed.model === 'string' ? parsed.model : '',
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      timeoutMs: Number.isFinite(parsed.timeoutMs) ? Number(parsed.timeoutMs) : 20000,
    }
  } catch {
    return getDefaultAiConfig()
  }
}

function saveLocalAiConfig(input: StoredAiConfig) {
  if (!hasBrowserStorage()) return
  window.localStorage.setItem(STORAGE_KEYS.aiConfig, JSON.stringify(input))
}

function toAiConfigStatus(config: StoredAiConfig): AiConfigStatus {
  const baseUrl = config.baseUrl.trim()
  const model = config.model.trim()
  const apiKey = config.apiKey.trim()

  return {
    ok: true,
    configured: Boolean(baseUrl && model && apiKey),
    provider: config.provider,
    baseUrl,
    baseUrlConfigured: Boolean(baseUrl),
    apiKeyConfigured: Boolean(apiKey),
    model,
    timeoutMs: config.timeoutMs,
    source: apiKey ? 'local-file' : 'none',
  }
}

function buildChatCompletionsUrl(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  if (trimmed.endsWith('/chat/completions')) return trimmed
  return `${trimmed}/chat/completions`
}

function buildSystemPrompt(request: { defaultDate: string; locale: string; categories: CategoryConfig }) {
  return [
    '你是一个中文个人记账解析器。请把用户的一句话解析成一条或多条账单，只返回 JSON，不要返回 Markdown。',
    `当前日期：${request.defaultDate}`,
    `语言：${request.locale}`,
    `收入分类：${request.categories.income.join('、')}`,
    `支出分类：${request.categories.expense.join('、')}`,
    '',
    '返回格式：',
    '{',
    '  "records": [',
    '    {',
    '      "type": "income" 或 "expense",',
    '      "amount": 数字,',
    '      "category": "必须从对应分类中选择",',
    '      "date": "YYYY-MM-DD",',
    '      "note": "简短备注",',
    '      "reimbursable": true 或 false',
    '    }',
    '  ],',
    '  "confidence": 0 到 1 的数字,',
    '  "warnings": []',
    '}',
    '',
    '规则：',
    '1. 用户一次说了几笔账单，就拆成几条 records。',
    '2. 每条记录都要单独判断日期；没有明确日期的记录使用当前日期。',
    '3. “花了、买、支付、打车、午饭、咖啡、房租”等通常是支出。',
    '4. “工资、到账、收到、红包、奖金、投资收益”等通常是收入。',
    '5. 相对日期如今天、昨天、上周五必须基于当前日期换算。',
    '6. 未知支出归为“其他支出”，未知收入归为“额外收入”。',
    '7. note 保留每条账单的核心事项，不要包含金额。',
    '8. 出现“报销、可报销、公司报销、客户报销、出差、差旅、发票报销”等语义时 reimbursable 为 true。',
    '9. 出现“不能报销、不可报销、自费、私人、个人消费”等语义时 reimbursable 为 false。',
    '10. 收入记录的 reimbursable 默认为 false。',
  ].join('\n')
}

function normalizeAmount(amount: number) {
  return Math.round(Number(amount) * 100) / 100
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function coerceReimbursable(value: unknown) {
  if (value === true) return true
  if (typeof value !== 'string') return false
  return ['true', '是', '可以', '可报销'].includes(value.trim().toLowerCase())
}

function validateAiRecord(
  record: unknown,
  categories: CategoryConfig,
  defaultDate: string,
): { error: string } | { value: TransactionInput; warnings: string[] } {
  const warnings: string[] = []

  if (!record || typeof record !== 'object') {
    return { error: 'AI 响应没有包含有效记录。' }
  }

  const value = record as {
    type?: string
    amount?: number
    category?: string
    date?: string
    note?: string
    reimbursable?: unknown
  }

  const type = value.type
  if (type !== 'income' && type !== 'expense') {
    return { error: 'AI 返回了无效的收支类型。' }
  }

  const amount = normalizeAmount(Number(value.amount))
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: 'AI 返回了无效金额。' }
  }

  const date = typeof value.date === 'string' && value.date.trim() ? value.date.trim() : defaultDate
  if (!isValidDate(date)) {
    return { error: 'AI 返回了无效日期。' }
  }

  const allowedCategories = type === 'income' ? categories.income : categories.expense
  const fallbackCategory = type === 'income' ? '额外收入' : '其他支出'
  let category = typeof value.category === 'string' ? value.category.trim() : ''
  if (!allowedCategories.includes(category)) {
    category = allowedCategories.includes(fallbackCategory) ? fallbackCategory : allowedCategories[0]
    warnings.push('分类不在预设列表中，已自动归入兜底分类。')
  }

  return {
    value: {
      type,
      amount,
      category,
      date,
      note: typeof value.note === 'string' ? value.note.trim().slice(0, 100) : '',
      reimbursable: type === 'expense' && coerceReimbursable(value.reimbursable),
    },
    warnings,
  }
}

function extractJson(content: string) {
  try {
    return JSON.parse(content)
  } catch {
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) return null

    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

async function readUpstreamError(response: Response) {
  try {
    const payload = await response.json()
    const message = payload?.error?.message || payload?.message || payload?.error || response.statusText
    return `AI 请求失败（${response.status}）：${message}`
  } catch {
    try {
      const text = await response.text()
      return `AI 请求失败（${response.status}）：${text || response.statusText}`
    } catch {
      return `AI 请求失败（${response.status}）：${response.statusText}`
    }
  }
}

export async function getAiConfigStatus(): Promise<AiConfigStatus> {
  return toAiConfigStatus(loadLocalAiConfig())
}

export async function saveAiConfig(input: AiConfigInput): Promise<AiConfigUpdateResponse> {
  const nextConfig: StoredAiConfig = {
    provider: 'openai-compatible',
    baseUrl: input.baseUrl.trim() || DEFAULT_AI_BASE_URL,
    model: input.model.trim() || DEFAULT_AI_MODEL,
    apiKey: input.apiKey.trim(),
    timeoutMs: Number.isFinite(input.timeoutMs) ? input.timeoutMs : 20000,
  }

  if (!nextConfig.apiKey) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: 'API key 不能为空。',
    }
  }

  saveLocalAiConfig(nextConfig)
  return toAiConfigStatus(nextConfig)
}

export async function getAiExportConfigSnapshot(categoryConfig: CategoryConfig): Promise<AiExportConfigSnapshot> {
  const aiConfig = loadLocalAiConfig()
  const normalizedCategories = normalizeCategoryConfig(categoryConfig)

  return {
    exportedAt: new Date().toISOString(),
    categoryConfig: normalizedCategories,
    aiConfig,
    prompt: buildSystemPrompt({
      defaultDate: getToday(),
      locale: 'zh-CN',
      categories: normalizedCategories,
    }),
  }
}

export async function importAiConfigSnapshot(
  snapshot: AiImportConfigSnapshot,
): Promise<AiConfigStatus | AiParseRecordErrorResponse> {
  const aiConfig = snapshot?.aiConfig
  if (!aiConfig || typeof aiConfig !== 'object') {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: '配置文件格式不正确。',
    }
  }

  const provider = typeof aiConfig.provider === 'string' && aiConfig.provider.trim() ? aiConfig.provider.trim() : 'openai-compatible'
  const baseUrl = typeof aiConfig.baseUrl === 'string' && aiConfig.baseUrl.trim() ? aiConfig.baseUrl.trim() : DEFAULT_AI_BASE_URL
  const model = typeof aiConfig.model === 'string' && aiConfig.model.trim() ? aiConfig.model.trim() : DEFAULT_AI_MODEL
  const apiKey = typeof aiConfig.apiKey === 'string' ? aiConfig.apiKey.trim() : ''
  const timeoutMs = Number.isFinite(aiConfig.timeoutMs) ? Number(aiConfig.timeoutMs) : 20000

  if (!apiKey) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: '配置文件缺少 API Key。',
    }
  }

  const nextConfig: StoredAiConfig = {
    provider,
    baseUrl,
    model,
    apiKey,
    timeoutMs,
  }

  saveLocalAiConfig(nextConfig)
  return toAiConfigStatus(nextConfig)
}

export async function parseNaturalLanguageRecord(
  text: string,
  categories: CategoryConfig,
): Promise<AiParseRecordResponse> {
  const config = loadLocalAiConfig()
  const status = toAiConfigStatus(config)
  if (!status.configured) {
    return {
      ok: false,
      code: 'AI_NOT_CONFIGURED',
      message: '请先在当前手机上配置 AI API。',
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs)
  const defaultDate = getToday()

  try {
    const response = await fetch(buildChatCompletionsUrl(config.baseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildSystemPrompt({ defaultDate, locale: 'zh-CN', categories }) },
          { role: 'user', content: text },
        ],
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      return {
        ok: false,
        code: 'AI_UPSTREAM_ERROR',
        message: await readUpstreamError(response),
      }
    }

    const payload = await response.json()
    const content = payload?.choices?.[0]?.message?.content
    if (typeof content !== 'string') {
      return {
        ok: false,
        code: 'PARSE_FAILED',
        message: 'AI 响应里没有可解析的文本内容。',
      }
    }

    const parsed = extractJson(content)
    if (!parsed) {
      return {
        ok: false,
        code: 'PARSE_FAILED',
        message: 'AI 响应不是合法 JSON。',
      }
    }

    const rawRecords = Array.isArray(parsed.records) ? parsed.records : [parsed.record ?? parsed].filter(Boolean)
    const records: AiParseRecordSuccessResponse['records'] = []
    const warnings: string[] = []

    for (const rawRecord of rawRecords) {
      const validated = validateAiRecord(rawRecord, categories, defaultDate)
      if ('error' in validated) {
        warnings.push(validated.error)
        continue
      }
      records.push(validated.value)
      warnings.push(...validated.warnings)
    }

    if (!records.length) {
      return {
        ok: false,
        code: 'VALIDATION_FAILED',
        message: 'AI 没有返回任何有效账目。',
      }
    }

    return {
      ok: true,
      records,
      record: records[0],
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
      warnings: [
        ...(Array.isArray(parsed.warnings) ? parsed.warnings.filter((item: unknown) => typeof item === 'string') : []),
        ...warnings,
      ],
    }
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') {
      return {
        ok: false,
        code: 'AI_TIMEOUT',
        message: 'AI 请求超时，请稍后重试。',
      }
    }

    return {
      ok: false,
      code: 'AI_UPSTREAM_ERROR',
      message: 'AI 请求失败。请检查 Base URL、模型、API key 和该服务是否允许浏览器直接访问（CORS）。',
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function getBookkeepingFiles(): Promise<BookkeepingFilesResponse> {
  return loadLocalBookkeepingFiles()
}

export async function saveBookkeepingFiles(input: {
  recordsMarkdown: string
  sourceMarkdown: string
  categoryConfig: CategoryConfig
}): Promise<BookkeepingFilesResponse> {
  return saveLocalBookkeepingFiles(input)
}
