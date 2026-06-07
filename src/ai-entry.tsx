import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { AiRecordInput } from './components/AiRecordInput'
import { appendSourceUtterance, createRecord, loadBookkeepingData, saveBookkeepingData, addCategoryToConfig } from './storage'
import './styles.css'
import type { CategoryConfig, SourceUtterance, TransactionInput, TransactionRecord } from './types'

registerSW({ immediate: true })

function AiEntryApp() {
  const [records, setRecords] = React.useState<TransactionRecord[]>([])
  const [utterances, setUtterances] = React.useState<SourceUtterance[]>([])
  const [categoryConfig, setCategoryConfig] = React.useState<CategoryConfig>({ income: [], expense: [] })
  const [ready, setReady] = React.useState(false)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      try {
        const data = await loadBookkeepingData()
        if (cancelled) return
        setRecords(data.records)
        setUtterances(data.utterances)
        setCategoryConfig(data.categoryConfig)
        setReady(true)
        setError('')
      } catch {
        if (!cancelled) {
          setError('无法读取账本数据，请稍后重试。')
          setReady(true)
        }
      }
    }

    bootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleAiSubmit(input: TransactionInput, rawText?: string) {
    const nextRecords = [createRecord(input), ...records]
    const nextUtterances = rawText ? appendSourceUtterance(utterances, rawText) : utterances
    const nextCategoryConfig = addCategoryToConfig(categoryConfig, input.type, input.category)

    setRecords(nextRecords)
    setUtterances(nextUtterances)
    setCategoryConfig(nextCategoryConfig)

    try {
      await saveBookkeepingData(nextRecords, nextUtterances, nextCategoryConfig)
      setError('')
    } catch {
      setError('保存失败，当前改动未成功写入。')
    }
  }

  return (
    <main className="app-shell ai-entry-shell">
      <header className="app-header">
        <div>
          <h1 className="app-title">快记</h1>
        </div>
        <button className="header-action" type="button" onClick={() => { window.location.href = '/' }}>
          返回账本
        </button>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      <p className="ai-entry-note">输入一句话，直接记账。</p>

      {ready ? (
        <AiRecordInput
          categories={categoryConfig}
          title="一句话记账"
          focusToken={1}
          onSubmit={handleAiSubmit}
          showConfig={false}
        />
      ) : (
        <section className="panel">
          <p className="empty-text">正在读取账本数据...</p>
        </section>
      )}
    </main>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AiEntryApp />
  </React.StrictMode>,
)
