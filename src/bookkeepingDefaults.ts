import type { CategoryConfig } from './types'

export const DEFAULT_CATEGORY_CONFIG: CategoryConfig = {
  income: ['工资', '额外收入'],
  expense: ['餐饮', '交通', '购物', '住房', '娱乐', '医疗', '教育', '其他支出'],
}

export const LOCAL_STORAGE_LABELS = {
  recordsPath: '浏览器本地存储 / 账单记录',
  sourcePath: '浏览器本地存储 / 原始语料',
  categoryPath: '浏览器本地存储 / 分类配置',
}

export function createDefaultRecordsMarkdown() {
  return [
    '# 小账本记录',
    '',
    `导出时间：${new Date().toLocaleString('zh-CN')}`,
    '',
    '- 记录数：0',
    '- 总收入：¥0.00',
    '- 总支出：¥0.00',
    '- 结余：¥0.00',
    '',
    '| ID | 日期 | 类型 | 分类 | 金额 | 是否可以报销 | 报销状态 | 备注 | 创建时间 | 更新时间 |',
    '| --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- |',
    '',
  ].join('\n')
}

export function createDefaultSourceMarkdown() {
  return [
    '# 小账本原始语料',
    '',
    `导出时间：${new Date().toLocaleString('zh-CN')}`,
    '',
    '- 语料条数：0',
    '',
    '| ID | 原始输入 | 创建时间 |',
    '| --- | --- | --- |',
    '',
  ].join('\n')
}
