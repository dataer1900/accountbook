const DEFAULT_INCOME_CATEGORIES = ['工资', '额外收入']
const DEFAULT_EXPENSE_CATEGORIES = ['餐饮', '交通', '购物', '住房', '娱乐', '医疗', '教育', '其他支出']

export function createError(code, message, status = 400) {
  return { ok: false, code, message, status }
}

export function validateParseRequest(body) {
  if (!body || typeof body !== 'object') {
    return { error: createError('INVALID_INPUT', 'Request body must be a JSON object.') }
  }

  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) {
    return { error: createError('INVALID_INPUT', 'Text is required.') }
  }

  if (text.length > 200) {
    return { error: createError('INVALID_INPUT', 'Text must be 200 characters or fewer.') }
  }

  const defaultDate = typeof body.defaultDate === 'string' ? body.defaultDate : getToday()
  if (!isValidDate(defaultDate)) {
    return { error: createError('INVALID_INPUT', 'defaultDate must be a valid YYYY-MM-DD date.') }
  }

  const income = Array.isArray(body.categories?.income) && body.categories.income.length
    ? body.categories.income.filter((item) => typeof item === 'string' && item.trim())
    : DEFAULT_INCOME_CATEGORIES

  const expense = Array.isArray(body.categories?.expense) && body.categories.expense.length
    ? body.categories.expense.filter((item) => typeof item === 'string' && item.trim())
    : DEFAULT_EXPENSE_CATEGORIES

  return {
    value: {
      text,
      defaultDate,
      locale: typeof body.locale === 'string' ? body.locale : 'zh-CN',
      categories: { income, expense },
    },
  }
}

export function validateAiRecord(record, categories, defaultDate = getToday()) {
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

  const note = typeof record.note === 'string' ? record.note.trim().slice(0, 100) : ''
  const reimbursable = type === 'expense' && coerceReimbursable(record.reimbursable)

  return {
    value: {
      type,
      amount,
      category,
      date,
      note,
      reimbursable,
    },
    warnings,
  }
}

function coerceReimbursable(value) {
  if (value === true) return true
  if (typeof value !== 'string') return false

  return ['true', '是', '可以', '可报销'].includes(value.trim().toLowerCase())
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
