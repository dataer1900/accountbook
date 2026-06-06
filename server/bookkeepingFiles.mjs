import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const DATA_DIR = resolve(process.cwd(), 'data')
const RECORDS_FILE = resolve(DATA_DIR, '账单记录.md')
const SOURCE_FILE = resolve(DATA_DIR, '原始语料.md')
const CATEGORY_FILE = resolve(DATA_DIR, '分类配置.json')

function ensureDataDir() {
  mkdirSync(DATA_DIR, { recursive: true })
}

function ensureFile(filePath, defaultContent) {
  ensureDataDir()

  try {
    readFileSync(filePath, 'utf8')
  } catch {
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, defaultContent, 'utf8')
  }
}

function createDefaultRecordsMarkdown() {
  return [
    '# 小账本记录',
    '',
    `导出时间：${new Date().toLocaleString('zh-CN')}`,
    '',
    '- 记录数：0',
    '- 总收入：¥0.00',
    '- 总支出：¥0.00',
    '- 结余：¥0.00',
    '',
    '| ID | 日期 | 类型 | 分类 | 金额 | 是否可以报销 | 报销状态 | 备注 | 创建时间 | 更新时间 |',
    '| --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- |',
    '',
  ].join('\n')
}

function createDefaultSourceMarkdown() {
  return [
    '# 小账本原始语料',
    '',
    `导出时间：${new Date().toLocaleString('zh-CN')}`,
    '',
    '- 语料条数：0',
    '',
    '| ID | 原始输入 | 创建时间 |',
    '| --- | --- | --- |',
    '',
  ].join('\n')
}

export function ensureBookkeepingFiles() {
  ensureFile(RECORDS_FILE, createDefaultRecordsMarkdown())
  ensureFile(SOURCE_FILE, createDefaultSourceMarkdown())
  ensureFile(CATEGORY_FILE, JSON.stringify(createDefaultCategoryConfig(), null, 2))
}

export function readBookkeepingFiles() {
  ensureBookkeepingFiles()

  return {
    recordsMarkdown: readFileSync(RECORDS_FILE, 'utf8'),
    sourceMarkdown: readFileSync(SOURCE_FILE, 'utf8'),
    categoryConfig: readCategoryConfig(),
    recordsPath: RECORDS_FILE,
    sourcePath: SOURCE_FILE,
    categoryPath: CATEGORY_FILE,
  }
}

export function writeRecordsMarkdown(markdown) {
  ensureBookkeepingFiles()
  writeFileSync(RECORDS_FILE, markdown, 'utf8')
}

export function writeSourceMarkdown(markdown) {
  ensureBookkeepingFiles()
  writeFileSync(SOURCE_FILE, markdown, 'utf8')
}

function createDefaultCategoryConfig() {
  return {
    income: ['工资', '额外收入'],
    expense: ['餐饮', '交通', '购物', '住房', '娱乐', '医疗', '教育', '其他支出'],
  }
}

export function readCategoryConfig() {
  ensureBookkeepingFiles()

  try {
    const raw = readFileSync(CATEGORY_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return normalizeCategoryConfig(parsed)
  } catch {
    const fallback = createDefaultCategoryConfig()
    writeCategoryConfig(fallback)
    return fallback
  }
}

export function writeCategoryConfig(config) {
  ensureBookkeepingFiles()
  const normalized = normalizeCategoryConfig(config)
  writeFileSync(CATEGORY_FILE, JSON.stringify(normalized, null, 2), 'utf8')
}

function normalizeCategoryConfig(value) {
  const fallback = createDefaultCategoryConfig()
  const income = Array.isArray(value?.income)
    ? value.income.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
    : fallback.income
  const expense = Array.isArray(value?.expense)
    ? value.expense.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
    : fallback.expense

  return {
    income: income.length ? Array.from(new Set(income)) : fallback.income,
    expense: expense.length ? Array.from(new Set(expense)) : fallback.expense,
  }
}
