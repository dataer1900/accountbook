const DEFAULT_INCOME_CATEGORIES = ['工资', '额外收入']
const DEFAULT_EXPENSE_CATEGORIES = ['餐饮', '交通', '购物', '住房', '娱乐', '医疗', '教育', '其他支出']

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
      return withCors(new Response(null, { status: 204 }))
    }

    if (request.method === 'POST' && url.pathname === '/api/ai/parse-record') {
      return withCors(await handleParseRecord(request))
    }

    return env.ASSETS.fetch(request)
  },
}

export async function handleParseRecord(request) {
  const body = await readJsonBody(request)
  if (body.error) return json(body.error, body.error.status)

  const validated = validateParseRequest(body.value)
  if (validated.error) return json(validated.error, validated.error.status)

  const result = await parseRecordWithAi(validated.value)
  if (result.error) return json(result.error, result.error.status)

  return json(result.value, 200)
}

async function parseRecordWithAi(request) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), request.aiConfig.timeoutMs)

  try {
    const response = await fetch(`${request.aiConfig.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${request.aiConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.aiConfig.model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildSystemPrompt(request) },
          { role: 'user', content: request.text },
        ],
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      return { error: createError('AI_UPSTREAM_ERROR', await readUpstreamError(response), 502) }
    }

    const payload = await response.json()
    const content = payload?.choices?.[0]?.message?.content
    if (typeof content !== 'string') {
      return { error: createError('PARSE_FAILED', 'AI response did not include text content.', 502) }
    }

    const parsed = extractJson(content)
    if (!parsed) {
      return { error: createError('PARSE_FAILED', 'AI response was not valid JSON.', 502) }
    }

    const rawRecords = Array.isArray(parsed.records) ? parsed.records : [parsed.record ?? parsed].filter(Boolean)
    const records = []
    const validationWarnings = []

    for (const rawRecord of rawRecords) {
      const validated = validateAiRecord(rawRecord, request.categories, request.defaultDate)
      if (validated.error) {
        validationWarnings.push(validated.error.message)
        continue
      }

      records.push(validated.value)
      validationWarnings.push(...validated.warnings)
    }

    if (!records.length) {
      return { error: createError('VALIDATION_FAILED', 'AI response did not contain any valid records.', 502) }
    }

    return {
      value: {
        ok: true,
        records,
        record: records[0],
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
        warnings: [
          ...(Array.isArray(parsed.warnings) ? parsed.warnings.filter((item) => typeof item === 'string') : []),
          ...validationWarnings,
        ],
      },
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { error: createError('AI_TIMEOUT', 'AI provider request timed out.', 504) }
    }

    const details = [error?.message, error?.cause?.message, request.aiConfig.baseUrl && `baseUrl=${request.aiConfig.baseUrl}`]
      .filter(Boolean)
      .join(' | ')

    return {
      error: createError(
        'AI_UPSTREAM_ERROR',
        details ? `AI provider request failed: ${details}` : 'AI provider request failed.',
        502,
      ),
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function readJsonBody(request) {
  try {
    return { value: await request.json() }
  } catch {
    return { error: createError('INVALID_INPUT', 'Request body must be valid JSON.', 400) }
  }
}

function validateParseRequest(body) {
  if (!body || typeof body !== 'object') {
    return { error: createError('INVALID_INPUT', 'Request body must be a JSON object.', 400) }
  }

  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) {
    return { error: createError('INVALID_INPUT', 'Text is required.', 400) }
  }

  if (text.length > 200) {
    return { error: createError('INVALID_INPUT', 'Text must be 200 characters or fewer.', 400) }
  }

  const defaultDate = typeof body.defaultDate === 'string' ? body.defaultDate : getToday()
  if (!isValidDate(defaultDate)) {
    return { error: createError('INVALID_INPUT', 'defaultDate must be a valid YYYY-MM-DD date.', 400) }
  }

  const income =
    Array.isArray(body.categories?.income) && body.categories.income.length
      ? body.categories.income.filter((item) => typeof item === 'string' && item.trim())
      : DEFAULT_INCOME_CATEGORIES
  const expense =
    Array.isArray(body.categories?.expense) && body.categories.expense.length
      ? body.categories.expense.filter((item) => typeof item === 'string' && item.trim())
      : DEFAULT_EXPENSE_CATEGORIES

  const aiConfig = validateAiConfig(body.aiConfig)
  if (aiConfig.error) {
    return { error: aiConfig.error }
  }

  return {
    value: {
      text,
      defaultDate,
      locale: typeof body.locale === 'string' ? body.locale : 'zh-CN',
      categories: { income, expense },
      aiConfig: aiConfig.value,
    },
  }
}

function validateAiConfig(value) {
  if (!value || typeof value !== 'object') {
    return { error: createError('INVALID_INPUT', 'AI config is required.', 400) }
  }

  const provider =
    typeof value.provider === 'string' && value.provider.trim() ? value.provider.trim() : 'openai-compatible'
  if (provider !== 'openai-compatible') {
    return { error: createError('INVALID_INPUT', 'Only openai-compatible provider is supported.', 400) }
  }

  const baseUrl = normalizeBaseUrl(typeof value.baseUrl === 'string' ? value.baseUrl : '')
  if (!isValidUrl(baseUrl)) {
    return { error: createError('INVALID_INPUT', 'Base URL must be a valid URL.', 400) }
  }

  const model = typeof value.model === 'string' ? value.model.trim() : ''
  if (!model) {
    return { error: createError('INVALID_INPUT', 'Model is required.', 400) }
  }

  const apiKey = typeof value.apiKey === 'string' ? value.apiKey.trim() : ''
  if (!apiKey) {
    return { error: createError('INVALID_INPUT', 'API key is required.', 400) }
  }

  const timeoutMsInput = Number(value.timeoutMs || 20000)
  const timeoutMs = Number.isFinite(timeoutMsInput) ? Math.min(Math.max(Math.round(timeoutMsInput), 3000), 120000) : 20000

  return {
    value: {
      provider,
      baseUrl,
      model,
      apiKey,
      timeoutMs,
    },
  }
}

function validateAiRecord(record, categories, defaultDate = getToday()) {
  const warnings = []

  if (!record || typeof record !== 'object') {
    return { error: createError('VALIDATION_FAILED', 'AI response did not contain a record.') }
  }

  const type = record.type
  if (type !== 'income' && type !== 'expense') {
    return { error: createError('VALIDATION_FAILED', 'Record type must be income or expense.') }
  }

  const amount = Math.round(Number(record.amount) * 100) / 100
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: createError('VALIDATION_FAILED', 'Amount must be greater than 0.') }
  }

  const date = typeof record.date === 'string' && record.date.trim() ? record.date.trim() : defaultDate
  if (!isValidDate(date)) {
    return { error: createError('VALIDATION_FAILED', 'Date must be a valid YYYY-MM-DD date.') }
  }

  const allowedCategories = type === 'income' ? categories.income : categories.expense
  const fallbackCategory = type === 'income' ? '额外收入' : '其他支出'
  let category = typeof record.category === 'string' ? record.category.trim() : ''

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
      note: typeof record.note === 'string' ? record.note.trim().slice(0, 100) : '',
      reimbursable: type === 'expense' && coerceReimbursable(record.reimbursable),
    },
    warnings,
  }
}

function buildSystemPrompt(request) {
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
    '10. 收入记录的 reimbursable 默认是 false。',
  ].join('\n')
}

async function readUpstreamError(response) {
  try {
    const payload = await response.json()
    const message = payload?.error?.message || payload?.message || payload?.error || response.statusText
    return `AI provider request failed (${response.status}): ${message}`
  } catch {
    try {
      const text = await response.text()
      return `AI provider request failed (${response.status}): ${text || response.statusText}`
    } catch {
      return `AI provider request failed (${response.status}): ${response.statusText}`
    }
  }
}

function extractJson(content) {
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

function coerceReimbursable(value) {
  if (value === true) return true
  if (typeof value !== 'string') return false
  return ['true', '是', '可以', '可报销'].includes(value.trim().toLowerCase())
}

function normalizeBaseUrl(value) {
  return String(value)
    .trim()
    .replace(/\/$/, '')
    .replace(/\/chat\/completions$/i, '')
}

function isValidUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function getToday() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function createError(code, message, status = 400) {
  return { ok: false, code, message, status }
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

function withCors(response) {
  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST,OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
