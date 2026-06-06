import { formatCurrency } from '../reporting'

type SummaryCardsProps = {
  incomeTotal: number
  expenseTotal: number
  balance: number
}

export function SummaryCards({ incomeTotal, expenseTotal, balance }: SummaryCardsProps) {
  return (
    <section className="summary-grid" aria-label="月度汇总">
      <article className="summary-hero">
        <div className="summary-hero-main">
          <span>本月速览</span>
          <strong>{formatCurrency(balance)}</strong>
          <small>{balance >= 0 ? '当前结余为正，继续记账即可。' : '当前结余为负，记得关注支出。'}</small>
        </div>
        <div className="summary-hero-side">
          <article className="summary-card expense-card">
            <span>支出</span>
            <strong>{formatCurrency(expenseTotal)}</strong>
          </article>
          <article className="summary-card income-card">
            <span>收入</span>
            <strong>{formatCurrency(incomeTotal)}</strong>
          </article>
        </div>
      </article>
    </section>
  )
}
