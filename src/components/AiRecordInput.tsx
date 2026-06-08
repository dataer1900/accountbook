import { useEffect, useRef, useState, type ReactNode } from 'react'
import { getAiConfigStatus, parseNaturalLanguageRecord, saveAiConfig } from '../aiClient'
import { formatCurrency } from '../reporting'
import type { AiConfigStatus, CategoryConfig, TransactionInput } from '../types'

type AiRecordInputProps = {
  categories: CategoryConfig
  focusToken?: number
  onSubmit?: (input: TransactionInput, rawText?: string) => void
  showConfig?: boolean
  showInput?: boolean
  title?: string
  showPanelHeading?: boolean
  compact?: boolean
  autoOpenConfigWhenUnconfigured?: boolean
  onConfigStatusChange?: (configured: boolean) => void
  footer?: ReactNode
}

export function AiRecordInput({
  categories,
  focusToken = 0,
  onSubmit,
  showConfig = true,
  showInput = true,
  title = 'AI记一笔',
  showPanelHeading = true,
  compact = false,
  autoOpenConfigWhenUnconfigured = false,
  onConfigStatusChange,
  footer,
}: AiRecordInputProps) {
  const [text, setText] = useState('')
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [configStatus, setConfigStatus] = useState<AiConfigStatus | null>(null)
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [timeoutMs, setTimeoutMs] = useState('20000')
  const [loading, setLoading] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [configMessage, setConfigMessage] = useState('')
  const [configError, setConfigError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  async function refreshConfigStatus() {
    const status = await getAiConfigStatus()
    setConfigStatus(status)
    setConfigured(status.configured)
    setBaseUrl(status.baseUrl || '')
    setModel(status.model || '')
    setTimeoutMs(String(status.timeoutMs || 20000))
    if (autoOpenConfigWhenUnconfigured && !status.configured) {
      setConfigOpen(true)
    }
    onConfigStatusChange?.(status.configured)
  }

  useEffect(() => {
    refreshConfigStatus().catch(() => {
      setConfigured(false)
      onConfigStatusChange?.(false)
    })
  }, [])

  useEffect(() => {
    if (!focusToken) return
    textareaRef.current?.focus()
  }, [focusToken])

  async function handleSaveConfig(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setConfigMessage('')
    setConfigError('')

    const nextTimeoutMs = Number(timeoutMs)

    if (!baseUrl.trim() || !model.trim()) {
      setConfigError('请填写 Base URL 和模型名称。')
      return
    }

    if (!apiKey.trim() && !configStatus?.apiKeyConfigured) {
      setConfigError('请填写 API Key。')
      return
    }

    setSavingConfig(true)
    try {
      const result = await saveAiConfig({
        provider: 'openai-compatible',
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        apiKey: apiKey.trim(),
        timeoutMs: Number.isFinite(nextTimeoutMs) ? nextTimeoutMs : 20000,
      })

      if (!result.ok) {
        setConfigError(result.message)
        return
      }

      setApiKey('')
      setConfigStatus(result)
      setConfigured(result.configured)
      setBaseUrl(result.baseUrl || '')
      setModel(result.model || '')
      setTimeoutMs(String(result.timeoutMs || 20000))
      setConfigMessage('AI 配置已保存。')
      onConfigStatusChange?.(result.configured)
    } catch {
      setConfigError('无法保存 AI 配置。')
      onConfigStatusChange?.(false)
    } finally {
      setSavingConfig(false)
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmed = text.trim()
    setMessage('')
    setError('')

    if (!trimmed) {
      setError('请输入一句记账描述。')
      return
    }

    if (trimmed.length > 200) {
      setError('描述不能超过 200 个字。')
      return
    }

    if (!configured) {
      setError('当前还没有配置 AI，请先保存 AI 配置。')
      if (showConfig) setConfigOpen(true)
      return
    }

    setLoading(true)
    try {
      const result = await parseNaturalLanguageRecord(trimmed, categories)
      if (!result.ok) {
        setError(getFriendlyError(result.code, result.message))
        if (result.code === 'AI_NOT_CONFIGURED' && showConfig) {
          setConfigOpen(true)
        }
        return
      }

      const records = result.records.length ? result.records : result.record ? [result.record] : []
      if (!records.length) {
        setError('没有识别出有效账目，请换一种说法。')
        return
      }

      records.forEach((record) => onSubmit?.(record, trimmed))
      setText('')
      setConfigured(true)
      setMessage(
        `已添加 ${records.length} 条记录：${records
          .map((record) => `${record.category} ${formatCurrency(record.amount)}${record.reimbursable ? ' / 可报销' : ''}`)
          .join('；')}`,
      )
    } catch {
      setConfigured(false)
      setError('AI 服务暂时不可用，请稍后再试。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="panel ai-input-panel">
      {!compact && showPanelHeading ? (
        <div className="panel-heading">
          <h2>{title}</h2>
          <span>{configured ? 'AI 已连接' : 'AI 未配置'}</span>
        </div>
      ) : null}

      {showConfig ? (
        <div className="ai-config-wrapper">
          <button className="ai-config-toggle" type="button" onClick={() => setConfigOpen((prev) => !prev)}>
            <span>AI 配置</span>
            <span className="ai-config-toggle-state">{configStatus?.apiKeyConfigured ? '已保存' : '未配置'}</span>
          </button>

          {configOpen ? (
            <form className="record-form ai-config-form" onSubmit={handleSaveConfig}>
              <label>
                Base URL
                <input
                  placeholder="https://api.deepseek.com"
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                />
              </label>

              <label>
                模型
                <input
                  placeholder="deepseek-chat"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                />
              </label>

              <label>
                API Key
                <input
                  autoComplete="off"
                  placeholder={configStatus?.apiKeyConfigured ? '留空则继续使用已保存的 Key' : '输入你的 API Key'}
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                />
              </label>

              <label>
                超时时间（毫秒）
                <input
                  inputMode="numeric"
                  min="3000"
                  max="120000"
                  step="1000"
                  type="number"
                  value={timeoutMs}
                  onChange={(event) => setTimeoutMs(event.target.value)}
                />
              </label>

              <button className="secondary-button" disabled={savingConfig} type="submit">
                {savingConfig ? '保存中...' : '保存 AI 配置'}
              </button>

              {configMessage ? <p className="form-success">{configMessage}</p> : null}
              {configError ? <p className="form-error">{configError}</p> : null}
            </form>
          ) : null}
        </div>
      ) : null}

      {showInput ? (
        <form className="record-form" onSubmit={handleSubmit}>
          <label className={compact ? 'compact-input-label' : undefined}>
            {compact ? null : '说一句账单内容'}
            <textarea
              ref={textareaRef}
              maxLength={200}
              placeholder="例如：昨天出差打车花了28，可报销；今天工资到账2000；午饭花了18"
              rows={compact ? 4 : 3}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </label>

          <button className="primary-button" disabled={loading || !configured} type="submit">
            {loading ? '识别中...' : 'AI记一笔'}
          </button>

          {message ? <p className="form-success">{message}</p> : null}
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      ) : null}
      {footer ? <div className="ai-panel-footer">{footer}</div> : null}
    </section>
  )
}

function getFriendlyError(code: string, message?: string) {
  if (code === 'AI_NOT_CONFIGURED') return 'AI 还没有配置，请先保存 AI 配置。'
  if (code === 'AI_UNAVAILABLE' || code === 'AI_UPSTREAM_ERROR') return '当前 AI 服务不可用，请稍后再试。'
  if (code === 'INVALID_INPUT') return '输入内容不符合要求，请换一句更短的描述。'
  if (code === 'PARSE_FAILED' || code === 'VALIDATION_FAILED') return '没有识别出有效账目，请换一种说法。'
  if (code === 'AI_TIMEOUT') return 'AI 响应超时，请稍后再试。'
  if (message) return message
  return 'AI 识别暂时不可用，请稍后再试。'
}
