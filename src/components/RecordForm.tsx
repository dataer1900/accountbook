import { useEffect, useState } from 'react'
import { getToday } from '../dateUtils'
import type { CategoryConfig, TransactionInput, TransactionRecord, TransactionType } from '../types'

type RecordFormProps = {
  categories: CategoryConfig
  defaultDate?: string
  editingRecord: TransactionRecord | null
  onCancelEdit: () => void
  onSubmit: (input: TransactionInput) => void
}

function getDefaultCategory(type: TransactionType, categories: CategoryConfig) {
  return type === 'income' ? categories.income[0] || '' : categories.expense[0] || ''
}

function getYesterday() {
  const date = new Date()
  date.setDate(date.getDate() - 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function RecordForm({ categories, defaultDate, editingRecord, onCancelEdit, onSubmit }: RecordFormProps) {
  const [type, setType] = useState<TransactionType>('expense')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<string>(getDefaultCategory('expense', categories))
  const [date, setDate] = useState(defaultDate || getToday())
  const [note, setNote] = useState('')
  const [reimbursable, setReimbursable] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!editingRecord) return

    setType(editingRecord.type)
    setAmount(String(editingRecord.amount))
    setCategory(editingRecord.category)
    setDate(editingRecord.date)
    setNote(editingRecord.note)
    setReimbursable(editingRecord.reimbursable)
    setError('')
  }, [editingRecord])

  useEffect(() => {
    if (editingRecord) return
    setDate(defaultDate || getToday())
    setCategory((current) => current || getDefaultCategory(type, categories))
  }, [defaultDate, editingRecord, type, categories])

  const presetCategories = type === 'income' ? categories.income : categories.expense
  const isCustomCategory = category.trim().length > 0 && !presetCategories.includes(category.trim())

  function handleTypeChange(nextType: TransactionType) {
    setType(nextType)
    setCategory(getDefaultCategory(nextType, categories))
    if (nextType === 'income') setReimbursable(false)
  }

  function resetForm() {
    setType('expense')
    setAmount('')
    setCategory(getDefaultCategory('expense', categories))
    setDate(defaultDate || getToday())
    setNote('')
    setReimbursable(false)
    setError('')
  }

  function handleCancelEdit() {
    resetForm()
    onCancelEdit()
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const numericAmount = Math.round(Number(amount) * 100) / 100
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('请输入大于 0 的金额。')
      return
    }

    if (!category.trim()) {
      setError('请输入分类。')
      return
    }

    if (!date) {
      setError('请选择日期。')
      return
    }

    onSubmit({
      type,
      amount: numericAmount,
      category: category.trim().slice(0, 30),
      date,
      note: note.trim().slice(0, 100),
      reimbursable: type === 'expense' ? reimbursable : false,
    })

    resetForm()
  }

  return (
    <section className="panel form-panel">
      <div className="panel-heading">
        <h2>{editingRecord ? '编辑记录' : '记一笔'}</h2>
        {editingRecord ? (
          <button className="text-button" type="button" onClick={handleCancelEdit}>
            取消编辑
          </button>
        ) : null}
      </div>

      {editingRecord ? <p className="edit-hint">正在编辑：{editingRecord.category} · {editingRecord.date}</p> : null}

      <form className="record-form" onSubmit={handleSubmit}>
        <div className="type-toggle" role="group" aria-label="收支类型">
          <button className={type === 'expense' ? 'active' : ''} type="button" onClick={() => handleTypeChange('expense')}>
            支出
          </button>
          <button className={type === 'income' ? 'active' : ''} type="button" onClick={() => handleTypeChange('income')}>
            收入
          </button>
        </div>

        <label>
          金额
          <input inputMode="decimal" min="0" placeholder="例如 25" step="0.01" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </label>

        <label>
          分类
          <div className="category-chips" role="group" aria-label="选择分类">
            {presetCategories.map((item) => (
              <button className={category === item ? 'active' : ''} key={item} type="button" onClick={() => setCategory(item)}>
                {item}
              </button>
            ))}
          </div>
          <input maxLength={30} placeholder="也可以手动输入新分类" value={category} onChange={(event) => setCategory(event.target.value)} />
          {isCustomCategory ? <small className="edit-hint">将作为新分类保存</small> : null}
        </label>

        <label>
          日期
          <div className="quick-date-row">
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            <button type="button" onClick={() => setDate(getToday())}>今天</button>
            <button type="button" onClick={() => setDate(getYesterday())}>昨天</button>
          </div>
        </label>

        <label>
          备注
          <input maxLength={100} placeholder="可选，例如 午饭" value={note} onChange={(event) => setNote(event.target.value)} />
        </label>

        <label className="reimbursable-toggle">
          <input type="checkbox" checked={reimbursable} disabled={type === 'income'} onChange={(event) => setReimbursable(event.target.checked)} />
          <span>是否可以报销</span>
        </label>

        {error ? <p className="form-error">{error}</p> : null}

        <button className="primary-button" type="submit">
          {editingRecord ? '保存修改' : '添加记录'}
        </button>
      </form>
    </section>
  )
}
