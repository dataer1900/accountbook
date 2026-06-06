import { formatCurrency } from '../reporting'
import type { MonthlyBillChartPoint } from '../types'

type MonthlyBillChartProps = {
  points: MonthlyBillChartPoint[]
  incomeTotal: number
  expenseTotal: number
  onSelectDate?: (date: string) => void
}

export function MonthlyBillChart({ points, incomeTotal, expenseTotal, onSelectDate }: MonthlyBillChartProps) {
  const totalActiveDays = points.filter((point) => point.recordCount > 0).length
  const balance = incomeTotal - expenseTotal
  const [year, month] = points[0]?.date.split('-') ?? ['', '']
  const firstDay = points[0] ? new Date(points[0].date).getDay() : 0
  const leadingSlots = Array.from({ length: firstDay === 0 ? 6 : firstDay - 1 }, (_, index) => `empty-${index}`)
  const weekLabels = ['一', '二', '三', '四', '五', '六', '日']

  return (
    <section className="panel bill-chart-panel">
      <div className="panel-heading">
        <h2>月度日历</h2>
        <span>{year}年{Number(month)}月</span>
      </div>

      <div className="calendar-summary" aria-label={`本月收入 ${formatCurrency(incomeTotal)}，支出 ${formatCurrency(expenseTotal)}，结余 ${formatCurrency(balance)}`}>
        <div>
          <span>支出</span>
          <strong>{formatCurrency(expenseTotal)}</strong>
        </div>
        <div>
          <span>收入</span>
          <strong>{formatCurrency(incomeTotal)}</strong>
        </div>
        <div>
          <span>节余</span>
          <strong className={balance < 0 ? 'negative-text' : ''}>{formatCurrency(balance)}</strong>
        </div>
      </div>

      <div className="calendar-weekdays">
        {weekLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="calendar-grid">
        {leadingSlots.map((slot) => (
          <div className="calendar-day empty" key={slot} />
        ))}
        {points.map((point) => (
          <button
            className={`calendar-day ${point.recordCount ? 'active' : ''}`}
            key={point.date}
            type="button"
            onClick={() => onSelectDate?.(point.date)}
          >
            <span className="calendar-day-number">{point.day}</span>
            {point.expenseTotal > 0 ? (
              <strong className="calendar-day-expense">{Math.round(point.expenseTotal)}</strong>
            ) : point.incomeTotal > 0 ? (
              <strong className="calendar-day-income">{Math.round(point.incomeTotal)}</strong>
            ) : null}
          </button>
        ))}
      </div>

      <p className="calendar-note">
        本月共有 {totalActiveDays} 天发生记账，{balance >= 0 ? '支出处于可控区间。' : '需要关注超支日期。'}
      </p>
    </section>
  )
}
