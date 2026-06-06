import { formatCurrency } from '../reporting'
import type { CategorySummary } from '../types'

type CategoryStatsProps = {
  title: string
  emptyText: string
  categories: CategorySummary[]
  tone?: 'expense' | 'income'
  centerLabel?: string
  centerValue?: number
}

const expensePalette = ['#19c0d1', '#2583f6', '#45c95a', '#ff952a', '#f55197', '#8b5cf6']
const incomePalette = ['#7c6cff', '#58c0ff', '#3dd598', '#f4b740', '#ff7f6b', '#2fceaa']

export function CategoryStats({
  title,
  emptyText,
  categories,
  tone = 'expense',
  centerLabel,
  centerValue,
}: CategoryStatsProps) {
  const palette = tone === 'expense' ? expensePalette : incomePalette
  const donutStyle = categories.length
    ? `conic-gradient(${categories
        .map((category, index) => {
          const start = categories.slice(0, index).reduce((sum, item) => sum + item.percentage, 0)
          const end = start + category.percentage
          return `${palette[index % palette.length]} ${start}% ${end}%`
        })
        .join(', ')})`
    : undefined
  const total = categories.reduce((sum, category) => sum + category.total, 0)
  const displayCenterLabel = centerLabel || (tone === 'expense' ? '总支出' : '总收入')
  const displayCenterValue = typeof centerValue === 'number' ? centerValue : total

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{title}</h2>
        <span>{categories.length ? `${categories.length} 个分类` : '暂无数据'}</span>
      </div>

      {categories.length === 0 ? (
        <p className="empty-text">{emptyText}</p>
      ) : (
        <div className="category-panel">
          <div className="donut-card">
            <div className="donut-chart" style={{ background: donutStyle }}>
              <div className="donut-center">
                <span>{displayCenterLabel}</span>
                <strong>{formatCurrency(displayCenterValue)}</strong>
              </div>
            </div>
            <div className="donut-legend">
              {categories.slice(0, 5).map((category, index) => (
                <span key={category.category}>
                  <i style={{ backgroundColor: palette[index % palette.length] }} />
                  {category.category}
                </span>
              ))}
            </div>
          </div>

          <div className="category-list">
          {categories.map((category) => (
            <article className="category-item" key={category.category}>
              <div className="category-row">
                <strong>
                  <i className="category-dot" style={{ backgroundColor: palette[categories.indexOf(category) % palette.length] }} />
                  {category.category}
                </strong>
                <span>{formatCurrency(category.total)}</span>
              </div>
              <div className="category-meta">
                <span>占比 {category.percentage}%</span>
                <span>{category.count} 笔</span>
              </div>
            </article>
          ))}
          </div>
        </div>
      )}
    </section>
  )
}
