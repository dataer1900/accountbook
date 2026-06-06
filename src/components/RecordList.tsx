import { formatCurrency, groupRecordsByDate } from '../reporting'
import type { TransactionRecord } from '../types'

type RecordListProps = {
  records: TransactionRecord[]
  onEdit: (record: TransactionRecord) => void
  onDelete: (recordId: string) => void
}

export function RecordList({ records, onEdit, onDelete }: RecordListProps) {
  const groups = groupRecordsByDate(records)

  function handleDelete(record: TransactionRecord) {
    const confirmed = window.confirm(`确定删除“${record.category} ${formatCurrency(record.amount)}”吗？`)
    if (confirmed) {
      onDelete(record.id)
    }
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>本月明细</h2>
        <span>{records.length} 条</span>
      </div>

      {records.length === 0 ? (
        <p className="empty-text">本月还没有记录，先添加一笔收入或支出。</p>
      ) : (
        <div className="record-list">
          {groups.map((group) => (
            <section className="record-day-group" key={group.date}>
              <div className="day-heading">
                <strong>{group.date}</strong>
                <span>
                  收 {formatCurrency(group.incomeTotal)} · 支 {formatCurrency(group.expenseTotal)} · {group.records.length} 条
                </span>
              </div>

              {group.records.map((record) => (
                <article className="record-item" key={record.id}>
                  <div className={`record-icon ${record.type}`}>{record.type === 'income' ? '收' : '支'}</div>
                  <div className="record-main">
                    <div className="record-title-row">
                      <strong>{record.category}</strong>
                      <span className={record.type === 'income' ? 'amount income' : 'amount expense'}>
                        {record.type === 'income' ? '+' : '-'}{formatCurrency(record.amount)}
                      </span>
                    </div>
                    <div className="record-meta">
                      {record.note ? <span>{record.note}</span> : <span>无备注</span>}
                      {record.reimbursable ? (
                        <span className="reimbursable-badge">
                          {record.reimbursementStatus === 'reimbursed'
                            ? '已报销'
                            : record.reimbursementStatus === 'submitted'
                              ? '已提交'
                              : '可报销'}
                        </span>
                      ) : null}
                      {record.updatedAt !== record.createdAt ? <span>已编辑</span> : null}
                    </div>
                    <div className="record-actions">
                      <button type="button" onClick={() => onEdit(record)}>
                        编辑
                      </button>
                      <button className="danger-button" type="button" onClick={() => handleDelete(record)}>
                        删除
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          ))}
        </div>
      )}
    </section>
  )
}
