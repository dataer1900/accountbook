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
  link.click()
  URL.revokeObjectURL(url)
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

  function handleExportMarkdown() {
    downloadFile(exportRecordsAsMarkdown(records), `小账本-backup-${getDateStamp()}.md`, 'text/markdown;charset=utf-8')
    setMessage(`已导出 ${records.length} 条 Markdown 账单。`)
    setError('')
  }

  function handleExportSourceUtterances() {
    downloadFile(
      exportSourceUtterancesAsMarkdown(sourceUtterances),
      `小账本-source-utterances-${getDateStamp()}.md`,
      'text/markdown;charset=utf-8',
    )
    setMessage(`已导出 ${sourceUtterances.length} 条原始语料。`)
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
    setMessage(shouldReplace ? `已替换为 ${nextRecords.length} 条记录。` : `已合并，当前共有 ${nextRecords.length} 条记录。`)
    setError('')
  }

  return (
    <section className="panel backup-panel">
      <div className="panel-heading">
        <h2>备份</h2>
        <span>{records.length} 条</span>
      </div>
      <p className="empty-text">当前为本地文件模式。账单、语料、分类都会分别写入固定文件。</p>
      <div className="report-grid">
        <div>
          <span>账单文件</span>
          <strong>账单记录.md</strong>
          <small className="empty-text">{recordsPath || '未读取到路径'}</small>
        </div>
        <div>
          <span>语料文件</span>
          <strong>原始语料.md</strong>
          <small className="empty-text">{sourcePath || '未读取到路径'}</small>
        </div>
        <div>
          <span>分类文件</span>
          <strong>分类配置.json</strong>
          <small className="empty-text">{categoryPath || '未读取到路径'}</small>
        </div>
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
