import { handleParseRecord } from '../../../worker/index.mjs'

export async function onRequestOptions() {
  return withCors(new Response(null, { status: 204 }))
}

export async function onRequestPost({ request }) {
  return withCors(await handleParseRecord(request))
}

export async function onRequest() {
  return withCors(
    new Response(JSON.stringify({ ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    }),
  )
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
