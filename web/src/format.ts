import type { Month } from '@consol/shared';
import { MONTHS, monthLabel } from '@consol/shared';

export { MONTHS, monthLabel };

export function fmt(n: number | undefined | null): string {
  if (n === undefined || n === null) return '-';
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function pct(n: number | undefined | null): string {
  if (n === undefined || n === null) return '-';
  return `${(n * 100).toFixed(2)}%`;
}

export function currencyTag(c: string): { label: string; cls: string } {
  if (c === 'CNY') return { label: '人民币 CNY', cls: 'currency-cny' };
  if (c === 'USD') return { label: '美元 USD', cls: 'currency-usd' };
  return { label: '欧元 EUR', cls: 'currency-eur' };
}

export type MonthValue = Month;
