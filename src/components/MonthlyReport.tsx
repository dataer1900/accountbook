import { formatMonth } from '../dateUtils'
import { formatCurrency } from '../reporting'
import type { MonthlyReportData } from '../types'

type MonthlyReportProps = {
  report: MonthlyReportData
}

export function MonthlyReport({ report }: MonthlyReportProps) {
  const topExpense = report.expenseCategories[0]
  const topIncome = report.incomeCategories[0]
  const hasRecords = report.records.length > 0

  return (
    <section className="panel report-panel">
      <div className="panel-heading">
        <h2>{formatMonth(report.month)}报表</h2>
        <span>{report.records.length} 笔记录</span>
      </div>
      <div className="report-grid">
        <div>
          <span>收入</span>
          <strong>{formatCurrency(report.incomeTotal)}</strong>
        </div>
        <div>
          <span>支出</span>
          <strong>{formatCurrency(report.expenseTotal)}</strong>
        </div>
        <div>
          <span>结余</span>
          <strong className={report.balance < 0 ? 'negative-text' : ''}>{formatCurrency(report.balance)}</strong>
        </div>
      </div>
      <p className="report-note">
        {!hasRecords
          ? '本月还没有记录，添加收入或支出后会自动生成月度分析。'
          : [
              topExpense ? `最大支出是“${topExpense.category}” ${formatCurrency(topExpense.total)}` : '本月暂无支出',
              topIncome ? `最大收入是“${topIncome.category}” ${formatCurrency(topIncome.total)}` : '本月暂无收入',
              report.balance >= 0 ? '本月结余为正。' : '本月支出超过收入。',
            ].join('；')}
      </p>
    </section>
  )
}
