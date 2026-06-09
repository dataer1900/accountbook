import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  DEFAULT_AI_BASE_URL,
  DEFAULT_AI_MODEL,
  getAiConfigStatus,
  getAiExportConfigSnapshot,
  importAiConfigSnapshot,
  parseNaturalLanguageRecord,
  saveAiConfig,
} from '../aiClient'
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

type ShareFileOptions = {
  content: string
  filename: string
  type: string
}

type ShareResult = 'shared' | 'downloaded' | 'cancelled'

function getDateStamp() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()

  window.setTimeout(() => {
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, 1000)
}

async function shareOrDownloadFile(options: ShareFileOptions): Promise<ShareResult> {
  const blob = new Blob([options.content], { type: options.type })

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      const canUseFiles = typeof File !== 'undefined' && typeof navigator.canShare === 'function'
      if (canUseFiles) {
        const file = new File([blob], options.filename, { type: options.type })
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: options.filename })
          return 'shared'
        }
      }

      await navigator.share({
        title: options.filename,
        text: options.content,
      })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'cancelled'
      }
    }
  }

  downloadFile(options.content, options.filename, options.type)
  return 'downloaded'
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
  const [exportingConfig, setExportingConfig] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [configMessage, setConfigMessage] = useState('')
  const [configError, setConfigError] = useState('')
  const configImportRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  async function refreshConfigStatus() {
    const status = await getAiConfigStatus()
    setConfigStatus(status)
    setConfigured(status.configured)
    setBaseUrl(status.baseUrl || DEFAULT_AI_BASE_URL)
    setModel(status.model || DEFAULT_AI_MODEL)
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

  async function handleExportConfig() {
    setConfigMessage('')
    setConfigError('')
    setExportingConfig(true)

    try {
      const filename = `小账本-ai-config-${getDateStamp()}.json`
      const snapshot = await getAiExportConfigSnapshot(categories)
      const result = await shareOrDownloadFile({
        content: JSON.stringify(snapshot, null, 2),
        filename,
        type: 'application/json;charset=utf-8',
      })

      if (result === 'cancelled') {
        setConfigMessage('已取消导出。')
        return
      }

      setConfigMessage(result === 'shared' ? `已打开系统分享：${filename}` : `已导出 ${filename}`)
    } catch {
      setConfigError('导出配置失败，请稍后再试。')
    } finally {
      setExportingConfig(false)
    }
  }

  async function handleImportConfig(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setConfigMessage('')
    setConfigError('')

    try {
      const raw = await file.text()
      const parsed = JSON.parse(raw) as unknown
      const result = await importAiConfigSnapshot(parsed as Parameters<typeof importAiConfigSnapshot>[0])

      if (!result.ok) {
        setConfigError(result.message)
        return
      }

      setConfigStatus(result)
      setConfigured(result.configured)
      setBaseUrl(result.baseUrl || DEFAULT_AI_BASE_URL)
      setModel(result.model || DEFAULT_AI_MODEL)
      setApiKey('')
      setTimeoutMs(String(result.timeoutMs || 20000))
      setConfigMessage('AI 配置已导入。')
      onConfigStatusChange?.(result.configured)
    } catch {
      setConfigError('导入失败，请确认文件是有效的 JSON 配置。')
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
              <div className="ai-config-actions">
                <button className="secondary-button" disabled={exportingConfig} type="button" onClick={handleExportConfig}>
                  {exportingConfig ? '导出中...' : '导出配置'}
                </button>
                <button className="secondary-button" type="button" onClick={() => configImportRef.current?.click()}>
                  导入配置
                </button>
                <input
                  accept="application/json,.json"
                  hidden
                  ref={configImportRef}
                  type="file"
                  onChange={handleImportConfig}
                />
              </div>

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
  if (code === 'AI_UPSTREAM_ERROR') return message || 'AI 请求失败，请检查网络、API Key、模型或浏览器跨域限制。'
  if (code === 'AI_UNAVAILABLE') return message || '当前 AI 服务不可用，请稍后再试。'
  if (code === 'INVALID_INPUT') return message || '输入内容不符合要求，请换一句更短的描述。'
  if (code === 'PARSE_FAILED' || code === 'VALIDATION_FAILED') return message || '没有识别出有效账目，请换一种说法。'
  if (code === 'AI_TIMEOUT') return message || 'AI 响应超时，请稍后再试。'
  if (message) return message
  return 'AI 识别暂时不可用，请稍后再试。'
}
