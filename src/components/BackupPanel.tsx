import { useRef, useState } from 'react'
import { getAiExportConfigSnapshot } from '../aiClient'
import {
  exportRecordsAsMarkdown,
  exportSourceUtterancesAsMarkdown,
  mergeRecords,
  parseImportedRecords,
} from '../storage'
import type { CategoryConfig, SourceUtterance, TransactionRecord } from '../types'

type BackupPanelProps = {
  records: TransactionRecord[]
  sourceUtterances: SourceUtterance[]
  categoryConfig: CategoryConfig
  onImport: (records: TransactionRecord[]) => void
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

export function BackupPanel({
  records,
  sourceUtterances,
  categoryConfig,
  onImport,
}: BackupPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function runBackup(
    options: ShareFileOptions,
    successMessage: { shared: string; downloaded: string; cancelled: string },
  ) {
    try {
      const result = await shareOrDownloadFile(options)

      if (result === 'cancelled') {
        setMessage(successMessage.cancelled)
        setError('')
        return
      }

      setMessage(result === 'shared' ? successMessage.shared : successMessage.downloaded)
      setError('')
    } catch {
      setMessage('')
      setError('导出失败，请稍后再试。')
    }
  }

  async function handleQuickBackup() {
    const filename = `小账本-backup-${getDateStamp()}.md`
    await runBackup(
      {
        content: exportRecordsAsMarkdown(records),
        filename,
        type: 'text/markdown;charset=utf-8',
      },
      {
        shared: `已打开系统分享：${filename}`,
        downloaded: `已导出 ${filename}`,
        cancelled: '已取消导出。',
      },
    )
  }

  async function handleExportSourceUtterances() {
    const filename = `小账本-source-${getDateStamp()}.md`
    await runBackup(
      {
        content: exportSourceUtterancesAsMarkdown(sourceUtterances),
        filename,
        type: 'text/markdown;charset=utf-8',
      },
      {
        shared: `已打开系统分享：${filename}`,
        downloaded: `已导出 ${filename}`,
        cancelled: '已取消导出。',
      },
    )
  }

  async function handleExportConfig() {
    const filename = `小账本-config-${getDateStamp()}.json`

    try {
      const snapshot = await getAiExportConfigSnapshot(categoryConfig)
      await runBackup(
        {
          content: JSON.stringify(snapshot, null, 2),
          filename,
          type: 'application/json;charset=utf-8',
        },
        {
          shared: `已打开系统分享：${filename}`,
          downloaded: `已导出 ${filename}`,
          cancelled: '已取消导出。',
        },
      )
    } catch {
      setMessage('')
      setError('导出配置失败，请稍后再试。')
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const raw = await file.text()
    const parsed = parseImportedRecords(raw)
    if ('error' in parsed) {
      setError(parsed.error)
      setMessage('')
      return
    }

    const shouldReplace = window.confirm(`识别到 ${parsed.records.length} 条记录。点击“确定”替换当前数据，点击“取消”则合并导入。`)
    const nextRecords = shouldReplace ? parsed.records : mergeRecords(records, parsed.records)
    onImport(nextRecords)
    setMessage(shouldReplace ? `已替换为 ${nextRecords.length} 条记录。` : `已合并导入，当前共有 ${nextRecords.length} 条记录。`)
    setError('')
  }

  return (
    <section className="panel backup-panel">
      <div className="panel-heading">
        <h2>备份</h2>
        <span>{records.length} 条</span>
      </div>

      <div className="backup-actions compact">
        <button className="secondary-button backup-primary-button" type="button" onClick={handleQuickBackup} disabled={!records.length}>
          导出账单
        </button>
        <button className="secondary-button" type="button" onClick={handleExportSourceUtterances}>
          导出语料
        </button>
        <button className="secondary-button" type="button" onClick={handleExportConfig}>
          导出配置
        </button>
        <button className="secondary-button" type="button" onClick={() => fileInputRef.current?.click()}>
          导入账单
        </button>
        <input accept="text/markdown,.md,.markdown" hidden ref={fileInputRef} type="file" onChange={handleFileChange} />
      </div>

      {message ? <p className="form-success">{message}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
    </section>
  )
}
