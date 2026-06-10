import { handleParseRecord } from '../worker/index.mjs'

export function aiProxyPlugin() {
  return {
    name: 'bookkeeping-ai-proxy',
    configureServer(server) {
      server.middlewares.use('/api/ai/parse-record', async (request, response) => {
        if (request.method === 'OPTIONS') {
          response.statusCode = 204
          response.end()
          return
        }

        if (request.method !== 'POST') {
          sendJson(response, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' })
          return
        }

        try {
          const body = await readBody(request)
          const proxyRequest = new Request('http://localhost/api/ai/parse-record', {
            method: 'POST',
            headers: {
              'Content-Type': request.headers['content-type'] || 'application/json',
            },
            body,
          })
          const proxyResponse = await handleParseRecord(proxyRequest)
          sendResponse(response, proxyResponse)
        } catch (error) {
          sendJson(response, 500, {
            ok: false,
            code: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'AI proxy failed.',
          })
        }
      })
    },
  }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []

    request.on('data', (chunk) => {
      chunks.push(chunk)
    })
    request.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
    request.on('error', reject)
  })
}

async function sendResponse(response, proxyResponse) {
  response.statusCode = proxyResponse.status
  proxyResponse.headers.forEach((value, key) => {
    response.setHeader(key, value)
  })
  response.end(await proxyResponse.text())
}

function sendJson(response, status, payload) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(payload))
}
