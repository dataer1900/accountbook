import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const LOCAL_CONFIG_PATH = resolve(process.cwd(), '.bookkeeping-ai-config.json')

function loadDotEnv() {
  const envPath = resolve(process.cwd(), '.env')
  if (!existsSync(envPath)) return

  const content = readFileSync(envPath, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex === -1) continue

    const key = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '')
    if (key && process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

loadDotEnv()

function readLocalConfig() {
  if (!existsSync(LOCAL_CONFIG_PATH)) return {}

  try {
    const parsed = JSON.parse(readFileSync(LOCAL_CONFIG_PATH, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function getEnvConfig() {
  return {
    provider: process.env.BOOKKEEPING_AI_PROVIDER || '',
    apiKey: process.env.BOOKKEEPING_AI_API_KEY || '',
    baseUrl: process.env.BOOKKEEPING_AI_BASE_URL || '',
    model: process.env.BOOKKEEPING_AI_MODEL || '',
    timeoutMs: process.env.BOOKKEEPING_AI_TIMEOUT_MS || '',
  }
}

export function getAiConfig() {
  const envConfig = getEnvConfig()
  const localConfig = readLocalConfig()
  const provider = envConfig.provider || localConfig.provider || 'openai-compatible'
  const apiKey = envConfig.apiKey || localConfig.apiKey || ''
  const baseUrl = normalizeBaseUrl(envConfig.baseUrl || localConfig.baseUrl || '')
  const model = envConfig.model || localConfig.model || ''
  const timeoutMs = Number(envConfig.timeoutMs || localConfig.timeoutMs || 20000)

  return {
    provider,
    apiKey,
    baseUrl,
    model,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 20000,
    configured: Boolean(apiKey && baseUrl && model),
    source: envConfig.apiKey || envConfig.baseUrl || envConfig.model ? 'env' : existsSync(LOCAL_CONFIG_PATH) ? 'local-file' : 'none',
  }
}

export function getPublicConfigStatus() {
  const config = getAiConfig()

  return {
    ok: true,
    configured: config.configured,
    provider: config.provider,
    baseUrl: config.baseUrl,
    baseUrlConfigured: Boolean(config.baseUrl),
    apiKeyConfigured: Boolean(config.apiKey),
    model: config.model,
    timeoutMs: config.timeoutMs,
    source: config.source,
  }
}

export function saveAiConfig(input) {
  const current = readLocalConfig()
  const provider = typeof input?.provider === 'string' && input.provider.trim() ? input.provider.trim() : 'openai-compatible'
  if (provider !== 'openai-compatible') {
    return { error: createConfigError('INVALID_INPUT', 'Only openai-compatible provider is supported.') }
  }

  const baseUrl = normalizeBaseUrl(typeof input?.baseUrl === 'string' ? input.baseUrl : '')
  if (!isValidUrl(baseUrl)) {
    return { error: createConfigError('INVALID_INPUT', 'Base URL must be a valid URL.') }
  }

  const model = typeof input?.model === 'string' ? input.model.trim() : ''
  if (!model) {
    return { error: createConfigError('INVALID_INPUT', 'Model is required.') }
  }

  const apiKeyInput = typeof input?.apiKey === 'string' ? input.apiKey.trim() : ''
  const apiKey = apiKeyInput || current.apiKey || ''
  if (!apiKey && !process.env.BOOKKEEPING_AI_API_KEY) {
    return { error: createConfigError('INVALID_INPUT', 'API key is required.') }
  }

  const timeoutMsInput = Number(input?.timeoutMs || current.timeoutMs || 20000)
  const timeoutMs = Number.isFinite(timeoutMsInput) ? Math.min(Math.max(Math.round(timeoutMsInput), 3000), 120000) : 20000

  writeFileSync(
    LOCAL_CONFIG_PATH,
    `${JSON.stringify({ provider, apiKey, baseUrl, model, timeoutMs, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  )

  return { value: getPublicConfigStatus() }
}

function createConfigError(code, message) {
  return { ok: false, code, message, status: 400 }
}

function isValidUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function normalizeBaseUrl(value) {
  return String(value)
    .trim()
    .replace(/\/$/, '')
    .replace(/\/chat\/completions$/i, '')
}
