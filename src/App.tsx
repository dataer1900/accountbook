import { useEffect, useMemo, useState } from 'react'
import { AiRecordInput } from './components/AiRecordInput'
import { BackupPanel } from './components/BackupPanel'
import { CategoryStats } from './components/CategoryStats'
import { MonthSelector } from './components/MonthSelector'
import { MonthlyBillChart } from './components/MonthlyBillChart'
import { MonthlyReport } from './components/MonthlyReport'
import { RecordForm } from './components/RecordForm'
import { RecordList } from './components/RecordList'
import { SummaryCards } from './components/SummaryCards'
import { getAiConfigStatus } from './aiClient'
import { formatDateTime, getCurrentMonth } from './dateUtils'
import { createMonthlyReport, formatCurrency, getReimbursementSummary } from './reporting'
import {
  addCategoryToConfig,
  appendSourceUtterance,
  createRecord,
  deleteRecord,
  loadBookkeepingData,
  saveBookkeepingData,
  updateRecord,
  updateReimbursementStatus,
} from './storage'
import type { CategoryConfig, SourceUtterance, TransactionInput, TransactionRecord } from './types'

type SectionKey = 'record' | 'view' | 'reimbursement' | 'mine'
type ReimbursementStatus = 'unsubmitted' | 'submitted' | 'reimbursed'

export default function App() {
  const aiEntryPath = '/ai-entry.html'
  const [records, setRecords] = useState<TransactionRecord[]>([])
  const [sourceUtterances, setSourceUtterances] = useState<SourceUtterance[]>([])
  const [categoryConfig, setCategoryConfig] = useState<CategoryConfig>({ income: [], expense: [] })
  const [recordsPath, setRecordsPath] = useState('')
  const [sourcePath, setSourcePath] = useState('')
  const [categoryPath, setCategoryPath] = useState('')
  const [dataReady, setDataReady] = useState(false)
  const [dataError, setDataError] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth())
  const [editingRecord, setEditingRecord] = useState<TransactionRecord | null>(null)
  const [activeSection, setActiveSection] = useState<SectionKey>('record')
  const [isComposerOpen, setIsComposerOpen] = useState(false)
  const [isManualEntryOpen, setIsManualEntryOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [manualEntryDate, setManualEntryDate] = useState<string | null>(null)
  const [aiFocusToken, setAiFocusToken] = useState(0)
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedReimbursementIds, setSelectedReimbursementIds] = useState<string[]>([])
  const [reimbursementSelectionMode, setReimbursementSelectionMode] = useState(false)
  const [quickEntryMessage, setQuickEntryMessage] = useState('')

  const report = useMemo(() => createMonthlyReport(records, selectedMonth), [records, selectedMonth])
  const selectedDateRecords = useMemo(
    () => (selectedDate ? report.records.filter((record) => record.date === selectedDate) : []),
    [report.records, selectedDate],
  )
  const selectedDateIncome = selectedDateRecords
    .filter((record) => record.type === 'income')
    .reduce((sum, record) => sum + record.amount, 0)
  const selectedDateExpense = selectedDateRecords
    .filter((record) => record.type === 'expense')
    .reduce((sum, record) => sum + record.amount, 0)
  const reportChartTone = report.expenseCategories.length ? 'expense' : 'income'
  const reportChartTitle = report.expenseCategories.length ? '支出情况' : '收入情况'
  const reportChartEmptyText =
    report.expenseCategories.length || report.incomeCategories.length ? '暂无可展示数据。' : '本月还没有记录。'
  const reportChartCategories = report.expenseCategories.length ? report.expenseCategories : report.incomeCategories
  const reimbursementSummary = useMemo(() => getReimbursementSummary(report.records), [report.records])
  const reimbursementRecords = useMemo(
    () => [
      ...reimbursementSummary.unsubmittedRecords,
      ...reimbursementSummary.submittedRecords,
      ...reimbursementSummary.reimbursedRecords,
    ],
    [reimbursementSummary],
  )

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      try {
        const data = await loadBookkeepingData()
        if (cancelled) return
        setRecords(data.records)
        setSourceUtterances(data.utterances)
        setCategoryConfig(data.categoryConfig)
        setRecordsPath(data.paths.recordsPath)
        setSourcePath(data.paths.sourcePath)
        setCategoryPath(data.paths.categoryPath)
        setDataReady(true)
        setDataError('')
      } catch {
        if (!cancelled) setDataError('无法读取账本数据，请稍后重试。')
      }
    }

    bootstrap()
    getAiConfigStatus().then((status) => setAiConfigured(status.configured)).catch(() => setAiConfigured(false))

    return () => {
      cancelled = true
    }
  }, [])

  async function persist(nextRecords: TransactionRecord[], nextUtterances: SourceUtterance[], nextCategoryConfig: CategoryConfig) {
    setRecords(nextRecords)
    setSourceUtterances(nextUtterances)
    setCategoryConfig(nextCategoryConfig)

    try {
      const result = await saveBookkeepingData(nextRecords, nextUtterances, nextCategoryConfig)
      setRecordsPath(result.recordsPath)
      setSourcePath(result.sourcePath)
      setCategoryPath(result.categoryPath)
      setDataError('')
    } catch {
      setDataError('保存失败，当前改动未成功写入。')
    }
  }

  function withCategory(input: TransactionInput) {
    return addCategoryToConfig(categoryConfig, input.type, input.category)
  }

  function closeManualEntry() {
    setEditingRecord(null)
    setManualEntryDate(null)
    setIsManualEntryOpen(false)
  }

  function handleSubmit(input: TransactionInput) {
    const nextRecords = editingRecord
      ? records.map((record) => (record.id === editingRecord.id ? updateRecord(record, input) : record))
      : [createRecord(input), ...records]
    setEditingRecord(null)
    setManualEntryDate(null)
    void persist(nextRecords, sourceUtterances, withCategory(input))
  }

  function handleEdit(record: TransactionRecord) {
    setEditingRecord(record)
    setManualEntryDate(null)
    setIsManualEntryOpen(true)
  }

  function handleDelete(recordId: string) {
    const nextRecords = deleteRecord(records, recordId)
    if (editingRecord?.id === recordId) setEditingRecord(null)
    void persist(nextRecords, sourceUtterances, categoryConfig)
  }

  function handleAiSubmit(input: TransactionInput, rawText?: string) {
    const nextRecords = [createRecord(input), ...records]
    const nextUtterances = rawText ? appendSourceUtterance(sourceUtterances, rawText) : sourceUtterances
    void persist(nextRecords, nextUtterances, withCategory(input))
  }

  function handleUpdateReimbursementStatus(recordId: string, reimbursementStatus: ReimbursementStatus) {
    void persist(updateReimbursementStatus(records, recordId, reimbursementStatus), sourceUtterances, categoryConfig)
  }

  function handleToggleReimbursementSelection(recordId: string) {
    if (!reimbursementSelectionMode) return
    setSelectedReimbursementIds((current) =>
      current.includes(recordId) ? current.filter((id) => id !== recordId) : [...current, recordId],
    )
  }

  function handleToggleReimbursementSelectionMode() {
    setReimbursementSelectionMode((current) => {
      if (current) setSelectedReimbursementIds([])
      return !current
    })
  }

  function handleSelectAllReimbursements() {
    if (reimbursementSelectionMode) setSelectedReimbursementIds(reimbursementRecords.map((record) => record.id))
  }

  function handleInvertReimbursements() {
    if (!reimbursementSelectionMode) return
    setSelectedReimbursementIds((current) =>
      reimbursementRecords.map((record) => record.id).filter((id) => !current.includes(id)),
    )
  }

  function handleBatchReimbursementStatus(reimbursementStatus: ReimbursementStatus) {
    if (!selectedReimbursementIds.length) return
    const nextRecords = selectedReimbursementIds.reduce(
      (currentRecords, recordId) => updateReimbursementStatus(currentRecords, recordId, reimbursementStatus),
      records,
    )
    setSelectedReimbursementIds([])
    setReimbursementSelectionMode(false)
    void persist(nextRecords, sourceUtterances, categoryConfig)
  }

  function handleImportRecords(nextRecords: TransactionRecord[]) {
    void persist(nextRecords, sourceUtterances, categoryConfig)
  }

  function openManualEntry(defaultDate?: string | null) {
    setEditingRecord(null)
    setManualEntryDate(defaultDate || null)
    setIsManualEntryOpen(true)
  }

  if (!dataReady && !dataError) {
    return (
      <main className="app-shell">
        <section className="panel">
          <p className="empty-text">正在读取账本数据...</p>
        </section>
      </main>
    )
  }

  if (dataError && !dataReady) {
    return (
      <main className="app-shell">
        <section className="panel">
          <p className="form-error">{dataError}</p>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1 className="app-title">
            {activeSection === 'record'
              ? '智能记账'
              : activeSection === 'view'
                ? '收支统计'
                : activeSection === 'reimbursement'
                  ? '报销管理'
                  : '我的'}
          </h1>
        </div>
        <button className="header-action" type="button" onClick={() => setSelectedMonth(getCurrentMonth())}>
          回到本月
        </button>
      </header>

      {dataError ? <p className="form-error">{dataError}</p> : null}

      {activeSection === 'record' ? (
        <section className="app-section stack" aria-label="记账页面">
          <SummaryCards incomeTotal={report.incomeTotal} expenseTotal={report.expenseTotal} balance={report.balance} />
          <MonthlyBillChart
            points={report.billChart}
            incomeTotal={report.incomeTotal}
            expenseTotal={report.expenseTotal}
            onSelectDate={setSelectedDate}
          />
        </section>
      ) : activeSection === 'view' ? (
        <section className="app-section stack" aria-label="报表页面">
          <MonthSelector month={selectedMonth} onChange={setSelectedMonth} />
          <CategoryStats
            title={reportChartTitle}
            emptyText={reportChartEmptyText}
            categories={reportChartCategories}
            tone={reportChartTone}
            centerLabel="总收入"
            centerValue={report.incomeTotal}
          />
        </section>
      ) : activeSection === 'reimbursement' ? (
        <section className="app-section stack" aria-label="报销页面">
          <MonthSelector month={selectedMonth} onChange={setSelectedMonth} />
          <section className="reimbursement-overview">
            <article className="reimbursement-overview-card">
              <span>未提交</span>
              <strong>{formatCurrency(reimbursementSummary.unsubmittedTotal)}</strong>
              <small>{reimbursementSummary.unsubmittedRecords.length} 条</small>
            </article>
            <article className="reimbursement-overview-card">
              <span>已提交</span>
              <strong>{formatCurrency(reimbursementSummary.submittedTotal)}</strong>
              <small>{reimbursementSummary.submittedRecords.length} 条</small>
            </article>
            <article className="reimbursement-overview-card">
              <span>已报销</span>
              <strong>{formatCurrency(reimbursementSummary.reimbursedTotal)}</strong>
              <small>{reimbursementSummary.reimbursedRecords.length} 条</small>
            </article>
          </section>

          <section className="panel reimbursement-section">
            <div className="panel-heading">
              <h2>报销明细</h2>
              <button className="text-button" type="button" onClick={handleToggleReimbursementSelectionMode}>
                {reimbursementSelectionMode ? '完成' : '选择'}
              </button>
            </div>
            <div className="reimbursement-toolbar">
              <span>
                {reimbursementSelectionMode
                  ? selectedReimbursementIds.length
                    ? `已选 ${selectedReimbursementIds.length} 项`
                    : '点击明细可单选或多选'
                  : '先点“选择”，再点明细进行批量处理'}
              </span>
              {reimbursementSelectionMode ? (
                <div className="reimbursement-toolbar-actions">
                  <button
                    className="secondary-button reimbursement-soft-button"
                    type="button"
                    onClick={handleSelectAllReimbursements}
                    disabled={!reimbursementRecords.length}
                  >
                    全选
                  </button>
                  <button
                    className="secondary-button reimbursement-soft-button"
                    type="button"
                    onClick={handleInvertReimbursements}
                    disabled={!reimbursementRecords.length}
                  >
                    反选
                  </button>
                  <button
                    className="secondary-button reimbursement-soft-button"
                    type="button"
                    onClick={() => handleBatchReimbursementStatus('unsubmitted')}
                    disabled={!selectedReimbursementIds.length}
                  >
                    设为未提交
                  </button>
                  <button
                    className="secondary-button reimbursement-soft-button"
                    type="button"
                    onClick={() => handleBatchReimbursementStatus('submitted')}
                    disabled={!selectedReimbursementIds.length}
                  >
                    设为已提交
                  </button>
                  <button
                    className="secondary-button reimbursement-soft-button"
                    type="button"
                    onClick={() => handleBatchReimbursementStatus('reimbursed')}
                    disabled={!selectedReimbursementIds.length}
                  >
                    设为已报销
                  </button>
                </div>
              ) : null}
            </div>
            {reimbursementRecords.length ? (
              <div className="reimbursement-list">
                {reimbursementRecords.map((record) => {
                  const isSelected = selectedReimbursementIds.includes(record.id)
                  return (
                    <article
                      className={`reimbursement-item ${record.reimbursementStatus} ${reimbursementSelectionMode ? 'selection-enabled' : ''} ${isSelected ? 'selected' : ''}`}
                      key={record.id}
                      onClick={() => handleToggleReimbursementSelection(record.id)}
                    >
                      {reimbursementSelectionMode ? (
                        <button
                          className={`reimbursement-check ${isSelected ? 'selected' : ''}`}
                          type="button"
                          aria-label={isSelected ? '取消选择该明细' : '选择该明细'}
                        >
                          <span />
                        </button>
                      ) : null}
                      <div className="reimbursement-main">
                        <strong>{record.category}</strong>
                        <span>
                          {record.date} 路 {record.note || '无备注'}
                        </span>
                        <small>更新时间 {formatDateTime(record.updatedAt)}</small>
                      </div>
                      <div className="reimbursement-actions">
                        <span className="amount expense">-{formatCurrency(record.amount)}</span>
                        <div className="reimbursement-status-row">
                          <span className="reimbursable-badge">
                            {record.reimbursementStatus === 'reimbursed'
                              ? '已报销'
                              : record.reimbursementStatus === 'submitted'
                                ? '已提交'
                                : '未提交'}
                          </span>
                          {reimbursementSelectionMode ? null : (
                            <div className="reimbursement-inline-actions">
                              <button
                                className="secondary-button reimbursement-soft-button"
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  handleUpdateReimbursementStatus(record.id, 'unsubmitted')
                                }}
                              >
                                未提交
                              </button>
                              <button
                                className="secondary-button reimbursement-soft-button"
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  handleUpdateReimbursementStatus(record.id, 'submitted')
                                }}
                              >
                                已提交
                              </button>
                              <button
                                className="secondary-button reimbursement-soft-button"
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  handleUpdateReimbursementStatus(record.id, 'reimbursed')
                                }}
                              >
                                已报销
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : (
              <p className="empty-text">当前没有可报销项目。</p>
            )}
          </section>
        </section>
      ) : (
        <section className="app-section stack" aria-label="我的页面">
          <section className="panel">
            <div className="panel-heading">
              <h2>AI 配置</h2>
              <span>{aiConfigured ? 'AI 已配置' : 'AI 未配置'}</span>
            </div>
            <AiRecordInput
              categories={categoryConfig}
              onSubmit={handleAiSubmit}
              onConfigStatusChange={setAiConfigured}
              footer={
                <div className="ai-entry-compact">
                  <div className="ai-entry-compact-header">
                    <div>
                      <strong>AI 入口</strong>
                      <p>可单独添加到桌面</p>
                    </div>
                    <code>{aiEntryPath}</code>
                  </div>
                  <div className="ai-entry-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => {
                        window.location.href = `${window.location.origin}${aiEntryPath}`
                      }}
                    >
                      打开
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={async () => {
                        try {
                          if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                            await navigator.clipboard.writeText(`${window.location.origin}${aiEntryPath}`)
                            setQuickEntryMessage('AI 入口链接已复制。')
                            return
                          }
                          setQuickEntryMessage('当前浏览器不支持一键复制，请手动记下这个链接。')
                        } catch {
                          setQuickEntryMessage('复制失败，请稍后重试。')
                        }
                      }}
                    >
                      复制链接
                    </button>
                  </div>
                  {quickEntryMessage ? <p className="form-success">{quickEntryMessage}</p> : null}
                </div>
              }
            />
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>手动记账</h2>
              <span>需要时打开</span>
            </div>
            <button className="secondary-button manual-entry-trigger" type="button" onClick={() => openManualEntry()}>
              打开手动记账
            </button>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>账单明细</h2>
              <button className="text-button" type="button" onClick={() => setDetailOpen((current) => !current)}>
                {detailOpen ? '收起' : '展开'}
              </button>
            </div>
            {detailOpen ? (
              <>
                <MonthlyReport report={report} />
                <RecordList records={report.records} onDelete={handleDelete} onEdit={handleEdit} />
              </>
            ) : (
              <p className="empty-text">默认已折叠，需要时再展开查看。</p>
            )}
          </section>
          <BackupPanel
            records={records}
            sourceUtterances={sourceUtterances}
            onImport={handleImportRecords}
          />
        </section>
      )}

      <nav className="section-tabs" aria-label="账本页面">
        <button className={`tab-record ${activeSection === 'record' ? 'active' : ''}`} type="button" onClick={() => setActiveSection('record')}>
          <svg className="section-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          <span className="section-tab-label">记账</span>
        </button>
        <button className={`tab-view ${activeSection === 'view' ? 'active' : ''}`} type="button" onClick={() => setActiveSection('view')}>
          <svg className="section-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 20V10" />
            <path d="M12 20V4" />
            <path d="M6 20v-6" />
          </svg>
          <span className="section-tab-label">报表</span>
        </button>
        <button
          className="center-tab"
          type="button"
          onClick={() => {
            setIsComposerOpen(true)
            setAiFocusToken((current) => current + 1)
          }}
        >
          <span className="center-tab-plus">+</span>
          <span className="section-tab-label">添加</span>
        </button>
        <button className={`tab-detail ${activeSection === 'reimbursement' ? 'active' : ''}`} type="button" onClick={() => setActiveSection('reimbursement')}>
          <svg className="section-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 7h10" />
            <path d="M7 12h10" />
            <path d="M7 17h6" />
            <path d="M18 17h.01" />
            <path d="M6 4v16" />
          </svg>
          <span className="section-tab-label">报销</span>
        </button>
        <button className={`tab-mine ${activeSection === 'mine' ? 'active' : ''}`} type="button" onClick={() => setActiveSection('mine')}>
          <svg className="section-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5 20c1.6-3.2 4-4.8 7-4.8s5.4 1.6 7 4.8" />
          </svg>
          <span className="section-tab-label">我的</span>
        </button>
      </nav>

      {isComposerOpen ? (
        <div className="composer-overlay" role="dialog" aria-modal="true" aria-label="智能记账" onClick={() => setIsComposerOpen(false)}>
          <div className="composer-sheet" onClick={(event) => event.stopPropagation()}>
            <button className="composer-close" type="button" onClick={() => setIsComposerOpen(false)} aria-label="关闭记账弹窗">
              ×
            </button>
            <AiRecordInput
              categories={categoryConfig}
              compact
              focusToken={aiFocusToken}
              onSubmit={handleAiSubmit}
              showConfig={false}
              onConfigStatusChange={setAiConfigured}
            />
          </div>
        </div>
      ) : null}

      {isManualEntryOpen ? (
        <div className="composer-overlay" role="dialog" aria-modal="true" aria-label="手动记账" onClick={closeManualEntry}>
          <div className="composer-sheet manual-composer-sheet" onClick={(event) => event.stopPropagation()}>
            <button className="composer-close" type="button" onClick={closeManualEntry} aria-label="关闭手动记账弹窗">
              ×
            </button>
            {aiConfigured === false && !editingRecord ? (
              <p className="composer-note">当前部署未连接 AI 服务，也可以直接手动记账。</p>
            ) : null}
            <RecordForm
              categories={categoryConfig}
              defaultDate={manualEntryDate || selectedDate || undefined}
              editingRecord={editingRecord}
              onCancelEdit={closeManualEntry}
              onSubmit={handleSubmit}
            />
          </div>
        </div>
      ) : null}

      {selectedDate ? (
        <div className="composer-overlay" role="dialog" aria-modal="true" aria-label="当天账单详情" onClick={() => setSelectedDate(null)}>
          <div className="composer-sheet date-detail-sheet" onClick={(event) => event.stopPropagation()}>
            <button className="composer-close" type="button" onClick={() => setSelectedDate(null)} aria-label="关闭当天账单详情">
              ×
            </button>
            <div className="date-detail-header">
              <strong>{selectedDate}</strong>
              <span>{selectedDateRecords.length ? `${selectedDateRecords.length} 条记录` : '当天还没有记录'}</span>
            </div>
            <div className="date-detail-summary">
              <div>
                <span>收入</span>
                <strong>{formatCurrency(selectedDateIncome)}</strong>
              </div>
              <div>
                <span>支出</span>
                <strong>{formatCurrency(selectedDateExpense)}</strong>
              </div>
            </div>
            {selectedDateRecords.length ? (
              <div className="date-detail-list">
                {selectedDateRecords.map((record) => (
                  <article className="date-detail-item" key={record.id}>
                    <div>
                      <strong>{record.category}</strong>
                      <span>{record.note || '无备注'}</span>
                    </div>
                    <span className={record.type === 'income' ? 'amount income' : 'amount expense'}>
                      {record.type === 'income' ? '+' : '-'}
                      {formatCurrency(record.amount)}
                    </span>
                  </article>
                ))}
              </div>
            ) : (
              <p className="empty-text">这一天还没有账单记录。</p>
            )}
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                setManualEntryDate(selectedDate)
                setSelectedDate(null)
                setEditingRecord(null)
                setIsManualEntryOpen(true)
              }}
            >
              记一笔
            </button>
          </div>
        </div>
      ) : null}
    </main>
  )
}
