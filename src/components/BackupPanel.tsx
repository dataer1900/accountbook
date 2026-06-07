import { useRef, useState } from 'react'
import {
  exportRecordsAsMarkdown,
  exportSourceUtterancesAsMarkdown,
  mergeRecords,
  parseImportedRecords,
} from '../storage'
import type { SourceUtterance, TransactionRecord } from '../types'

type BackupPanelProps = {
  records: TransactionRecord[]
  sourceUtterances: SourceUtterance[]
  recordsPath: string
  sourcePath: string
  categoryPath: string
  onImport: (records: TransactionRecord[]) => void
}

type ShareFileOptions = {
  content: string
  filename: string
  type: string
}

function getDateStamp() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function createFile({ content, filename, type }: ShareFileOptions) {
  const blob = new Blob([content], { type })
  return new File([blob], filename, { type })
}

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

async function shareOrDownloadFile(options: ShareFileOptions) {
  const file = createFile(options)

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      const sharePayload = navigator.canShare?.({ files: [file] })
        ? { files: [file], title: options.filename }
        : { title: options.filename, text: options.content }
      await navigator.share(sharePayload)
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
  recordsPath,
  sourcePath,
  categoryPath,
  onImport,
}: BackupPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleQuickBackup() {
    const filename = `小账本-backup-${getDateStamp()}.md`
    const result = await shareOrDownloadFile({
      content: exportRecordsAsMarkdown(records),
      filename,
      type: 'text/markdown;charset=utf-8',
    })

    if (result === 'cancelled') {
      setMessage('已取消本次备份。')
      setError('')
      return
    }

    setMessage(
      result === 'shared'
        ? `已打开系统分享，请保存 ${filename} 到“文件”App 或 iCloud Drive。`
        : `已导出 ${records.length} 条账单，请转存 ${filename}。`,
    )
    setError('')
  }

  async function handleExportMarkdown() {
    const filename = `小账本-backup-${getDateStamp()}.md`
    const result = await shareOrDownloadFile({
      content: exportRecordsAsMarkdown(records),
      filename,
      type: 'text/markdown;charset=utf-8',
    })

    if (result === 'cancelled') {
      setMessage('已取消账单导出。')
      setError('')
      return
    }

    setMessage(result === 'shared' ? `已打开系统分享：${filename}` : `已导出 ${records.length} 条 Markdown 账单。`)
    setError('')
  }

  async function handleExportSourceUtterances() {
    const filename = `小账本-source-${getDateStamp()}.md`
    const result = await shareOrDownloadFile({
      content: exportSourceUtterancesAsMarkdown(sourceUtterances),
      filename,
      type: 'text/markdown;charset=utf-8',
    })

    if (result === 'cancelled') {
      setMessage('已取消语料导出。')
      setError('')
      return
    }

    setMessage(result === 'shared' ? `已打开系统分享：${filename}` : `已导出 ${sourceUtterances.length} 条原始语料。`)
    setError('')
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
      <p className="empty-text">当前数据保存在这个浏览器里。请固定用同一个域名，并定期备份到“文件”App 或 iCloud Drive。</p>

      <div className="backup-callout">
        <strong>一键备份</strong>
        <span>iPhone 上会优先打开系统分享，直接存到“文件”更稳。</span>
        <button className="secondary-button backup-primary-button" type="button" onClick={handleQuickBackup} disabled={!records.length}>
          备份到文件
        </button>
      </div>

      <div className="report-grid">
        <div>
          <span>账单文件</span>
          <strong>账单记录.md</strong>
          <small className="empty-text">{recordsPath || '当前为浏览器本地模式'}</small>
        </div>
        <div>
          <span>语料文件</span>
          <strong>原始语料.md</strong>
          <small className="empty-text">{sourcePath || '当前为浏览器本地模式'}</small>
        </div>
        <div>
          <span>分类文件</span>
          <strong>分类配置.json</strong>
          <small className="empty-text">{categoryPath || '当前为浏览器本地模式'}</small>
        </div>
      </div>

      <div className="backup-tips">
        <span>建议：每次记完重要账目就点一次“备份到文件”。</span>
        <span>恢复时，用“导入账单”选回之前备份的 `.md` 文件。</span>
      </div>

      <div className="backup-actions">
        <button className="secondary-button" type="button" onClick={handleExportMarkdown} disabled={!records.length}>
          导出账单
        </button>
        <button className="secondary-button" type="button" onClick={handleExportSourceUtterances}>
          导出语料
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
