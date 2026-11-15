import type { Month } from './types.js';

export const YEAR = 2026;
export const MONTHS: Month[] = Array.from({ length: 12 }, (_, i) =>
  `${YEAR}-${String(i + 1).padStart(2, '0')}`,
);

export function monthLabel(m: Month): string {
  const [y, mm] = m.split('-');
  return `${y}年${Number(mm)}月`;
}

export function monthIndex(m: Month): number {
  return Number(m.split('-')[1]) - 1;
}

/** m 是否在 [from, to] 闭区间内（月份序号比较） */
export function between(m: Month, from: Month | null, to: Month | null): boolean {
  const i = monthIndex(m);
  if (from !== null && i < monthIndex(from)) return false;
  if (to !== null && i > monthIndex(to)) return false;
  return true;
}

export function prevMonth(m: Month): Month | null {
  const i = monthIndex(m);
  return i === 0 ? null : MONTHS[i - 1];
}
