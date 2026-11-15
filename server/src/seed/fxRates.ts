import type { FxRate } from '@consol/shared';
import { MONTHS } from '@consol/shared';

/**
 * 2026 年各月汇率（1 外币 = X 人民币），四位小数。
 * closingRate：月末即期汇率，用于资产负债表项目；
 * averageRate：当月平均汇率，用于利润表项目（YTD 报送时按报送月份的平均汇率整体折算，
 *              实际系统中也可按各月发生额分别折算，本系统按月平均简化处理）。
 * 汇率全年呈温和波动，用于产生真实的外币报表折算差额。
 */
const USD_CLOSING = [7.12, 7.1, 7.15, 7.18, 7.16, 7.13, 7.08, 7.05, 7.11, 7.17, 7.2, 7.18];
const USD_AVERAGE = [7.1, 7.11, 7.12, 7.16, 7.17, 7.15, 7.1, 7.07, 7.08, 7.14, 7.19, 7.19];
const EUR_CLOSING = [7.78, 7.75, 7.82, 7.86, 7.9, 7.88, 7.82, 7.79, 7.84, 7.9, 7.92, 7.89];
const EUR_AVERAGE = [7.76, 7.77, 7.78, 7.84, 7.88, 7.89, 7.85, 7.81, 7.82, 7.87, 7.91, 7.91];

export const FX_RATES: FxRate[] = MONTHS.flatMap((month, i) => [
  {
    month,
    currency: 'USD' as const,
    closingRate: USD_CLOSING[i],
    averageRate: USD_AVERAGE[i],
  },
  {
    month,
    currency: 'EUR' as const,
    closingRate: EUR_CLOSING[i],
    averageRate: EUR_AVERAGE[i],
  },
]);

export function getFxRate(month: string, currency: string): FxRate | undefined {
  return FX_RATES.find((r) => r.month === month && r.currency === currency);
}
