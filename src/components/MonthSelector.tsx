import { useRef } from 'react'
import { formatMonth, shiftMonth } from '../dateUtils'

type MonthSelectorProps = {
  month: string
  onChange: (month: string) => void
}

export function MonthSelector({ month, onChange }: MonthSelectorProps) {
  const months = Array.from({ length: 6 }, (_, index) => shiftMonth(month, index - 5))
  const monthInputRef = useRef<HTMLInputElement | null>(null)

  function openMonthPicker() {
    const input = monthInputRef.current
    if (!input) return

    if (typeof input.showPicker === 'function') {
      input.showPicker()
      return
    }

    input.click()
  }

  return (
    <section className="month-selector" aria-label="选择月份">
      <div className="month-selector-top">
        <button className="month-selector-title" type="button" onClick={openMonthPicker}>
          <strong>{formatMonth(month)}</strong>
          <span className="month-selector-caret">▼</span>
        </button>
        <input
          ref={monthInputRef}
          className="month-selector-native-input"
          type="month"
          value={month}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>

      <div className="month-chip-row" role="list" aria-label="月份快捷切换">
        {months.map((item) => (
          <button
            className={item === month ? 'active' : ''}
            key={item}
            type="button"
            onClick={() => onChange(item)}
          >
            {formatMonthChip(item)}
          </button>
        ))}
      </div>
    </section>
  )
}

function formatMonthChip(month: string) {
  const [, monthPart] = month.split('-')
  return `${Number(monthPart)}月`
}
