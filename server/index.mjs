import { createServer } from 'node:http'
import { getPublicConfigStatus, saveAiConfig } from './aiConfig.mjs'
import { parseRecordWithAi } from './aiParser.mjs'
import {
  ensureBookkeepingFiles,
  readBookkeepingFiles,
  writeCategoryConfig,
  writeRecordsMarkdown,
  writeSourceMarkdown,
} from './bookkeepingFiles.mjs'
import { createError, validateParseRequest } from './validation.mjs'

const PORT = Number(process.env.BOOKKEEPING_API_PORT || 8787)
const MAX_BODY_BYTES = 16 * 1024
const MAX_MARKDOWN_BYTES = 512 * 1024
const allowedOrigin = process.env.BOOKKEEPING_ALLOWED_ORIGIN || 'http://localhost:5173'

ensureBookkeepingFiles()

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)

    if (request.method === 'OPTIONS') {
      sendJson(response, 204, null)
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/ai/config') {
      sendJson(response, 200, getPublicConfigStatus())
      return
    }

    if (request.method === 'PUT' && url.pathname === '/api/ai/config') {
      const body = await readJsonBody(request)
      if (body.error) {
        sendError(response, body.error)
        return
      }

      const result = saveAiConfig(body.value)
      if (result.error) {
        sendError(response, result.error)
        return
      }

      sendJson(response, 200, result.value)
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/ai/parse-record') {
      const body = await readJsonBody(request)
      if (body.error) {
        sendError(response, body.error)
        return
      }

      const validation = validateParseRequest(body.value)
      if (validation.error) {
        sendError(response, validation.error)
        return
      }

      const result = await parseRecordWithAi(validation.value)
      if (result.error) {
        sendError(response, result.error)
        return
      }

      sendJson(response, 200, result.value)
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/bookkeeping/files') {
      sendJson(response, 200, {
        ok: true,
        ...readBookkeepingFiles(),
      })
      return
    }

    if (request.method === 'PUT' && url.pathname === '/api/bookkeeping/files') {
      const body = await readJsonBody(request)
      if (body.error) {
        sendError(response, body.error)
        return
      }

      const validation = validateBookkeepingFilesPayload(body.value)
      if (validation.error) {
        sendError(response, validation.error)
        return
      }

      writeRecordsMarkdown(validation.value.recordsMarkdown)
      writeSourceMarkdown(validation.value.sourceMarkdown)
      writeCategoryConfig(validation.value.categoryConfig)

      sendJson(response, 200, {
        ok: true,
        ...readBookkeepingFiles(),
      })
      return
    }

    sendJson(response, 404, { ok: false, code: 'NOT_FOUND', message: 'Route not found.' })
  } catch {
    sendJson(response, 500, { ok: false, code: 'INTERNAL_ERROR', message: 'Internal server error.' })
  }
})

server.listen(PORT, () => {
  console.log(`Bookkeeping AI backend listening on http://localhost:${PORT}`)
})

server.on('error', (error) => {
  if (error?.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the conflicting process or set BOOKKEEPING_API_PORT to another port.`)
    process.exit(1)
  }

  console.error('Failed to start backend server.', error)
  process.exit(1)
})

async function readJsonBody(request) {
  const chunks = []
  let size = 0

  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) {
      return { error: createError('INVALID_INPUT', 'Request body is too large.', 413) }
    }
    chunks.push(chunk)
  }

  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return { value: {} }

  try {
    return { value: JSON.parse(raw) }
  } catch {
    return { error: createError('INVALID_INPUT', 'Request body must be valid JSON.') }
  }
}

function validateBookkeepingFilesPayload(value) {
  if (!value || typeof value !== 'object') {
    return { error: createError('INVALID_INPUT', 'Request body must be a JSON object.') }
  }

  const recordsMarkdown = typeof value.recordsMarkdown === 'string' ? value.recordsMarkdown : null
  const sourceMarkdown = typeof value.sourceMarkdown === 'string' ? value.sourceMarkdown : null
  if (recordsMarkdown === null || sourceMarkdown === null) {
    return { error: createError('INVALID_INPUT', 'recordsMarkdown and sourceMarkdown are required.') }
  }

  if (Buffer.byteLength(recordsMarkdown, 'utf8') > MAX_MARKDOWN_BYTES) {
    return { error: createError('INVALID_INPUT', 'recordsMarkdown is too large.', 413) }
  }

  if (Buffer.byteLength(sourceMarkdown, 'utf8') > MAX_MARKDOWN_BYTES) {
    return { error: createError('INVALID_INPUT', 'sourceMarkdown is too large.', 413) }
  }

  const categoryConfig = normalizeCategoryConfig(value.categoryConfig)
  if (!categoryConfig) {
    return { error: createError('INVALID_INPUT', 'categoryConfig must include non-empty income and expense string arrays.') }
  }

  return {
    value: {
      recordsMarkdown,
      sourceMarkdown,
      categoryConfig,
    },
  }
}

function normalizeCategoryConfig(value) {
  if (!value || typeof value !== 'object') return null

  const income = normalizeCategoryList(value.income)
  const expense = normalizeCategoryList(value.expense)
  if (!income.length || !expense.length) return null

  return { income, expense }
}

function normalizeCategoryList(value) {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(
      value
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  )
}

function sendError(response, error) {
  sendJson(response, error.status || 400, {
    ok: false,
    code: error.code,
    message: error.message,
  })
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
  })

  if (payload === null) {
    response.end()
    return
  }

  response.end(JSON.stringify(payload))
}
