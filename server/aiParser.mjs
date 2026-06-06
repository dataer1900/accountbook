import { getAiConfig } from './aiConfig.mjs'
import { createError, validateAiRecord } from './validation.mjs'

export async function parseRecordWithAi(request) {
  const config = getAiConfig()
  if (!config.configured) {
    return { error: createError('AI_NOT_CONFIGURED', 'AI backend is not configured.', 503) }
  }

  if (config.provider !== 'openai-compatible') {
    return { error: createError('AI_UPSTREAM_ERROR', 'Only openai-compatible provider is supported in this version.', 501) }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs)

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
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
          { role: 'system', content: buildSystemPrompt(request) },
          { role: 'user', content: request.text },
        ],
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorMessage = await readUpstreamError(response)
      return { error: createError('AI_UPSTREAM_ERROR', errorMessage, 502) }
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

    const rawRecords = Array.isArray(parsed.records) ? parsed.records : [parsed.record ?? parsed]
    const records = []
    const validationWarnings = []

    for (const rawRecord of rawRecords) {
      const result = validateAiRecord(rawRecord, request.categories, request.defaultDate)
      if (result.error) {
        validationWarnings.push(result.error.message)
        continue
      }

      records.push(result.value)
      validationWarnings.push(...result.warnings)
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
        warnings: [...(Array.isArray(parsed.warnings) ? parsed.warnings.filter((item) => typeof item === 'string') : []), ...validationWarnings],
      },
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { error: createError('AI_TIMEOUT', 'AI provider request timed out.', 504) }
    }

    const details = [
      error?.message,
      error?.cause?.message,
      config.baseUrl ? `baseUrl=${config.baseUrl}` : '',
    ]
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

async function readUpstreamError(response) {
  try {
    const payload = await response.json()
    const message =
      payload?.error?.message ||
      payload?.message ||
      payload?.error ||
      response.statusText

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

function buildSystemPrompt(request) {
  return `你是一个中文个人记账解析器。请把用户的一句话解析成一条或多条账单，只返回 JSON，不要返回 Markdown。\n\n当前日期：${request.defaultDate}\n语言：${request.locale}\n收入分类：${request.categories.income.join('、')}\n支出分类：${request.categories.expense.join('、')}\n\n返回格式：\n{\n  "records": [\n    {\n      "type": "income" 或 "expense",\n      "amount": 数字,\n      "category": "必须从对应分类中选择",\n      "date": "YYYY-MM-DD",\n      "note": "简短备注",\n      "reimbursable": true 或 false\n    }\n  ],\n  "confidence": 0 到 1 的数字,\n  "warnings": []\n}\n\n规则：\n1. 用户一次说了几笔账单，就拆成几条 records；不要把多笔合并成一笔。\n2. 每条记录都要单独判断日期；没有明确日期的记录使用当前日期。\n3. “花了、买、支付、打车、午饭、咖啡、房租”等通常是支出。\n4. “工资、到账、收到、红包、奖金、投资收益”等通常是收入。\n5. 相对日期如今天、昨天、上周五必须基于当前日期换算。\n6. 未知支出归为“其他支出”，未知收入归为“额外收入”。\n7. note 保留每条账单的核心事项，不要包含金额。\n8. 出现“报销、可报销、公司报销、客户报销、出差、差旅、发票报销”等语义时 reimbursable 为 true。\n9. 出现“不能报销、不可报销、自费、私人、个人消费”等语义时 reimbursable 为 false。\n10. 收入记录的 reimbursable 默认为 false。`
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
