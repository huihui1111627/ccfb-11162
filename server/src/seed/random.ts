/**
 * 可复现的伪随机工具：固定种子，保证每次生成的虚构数据完全一致，
 * 这样手工底稿与系统结果才能逐月逐项对得上。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 四舍五入到整数（记账本位币金额取整，折算后再保留两位小数） */
export function roundInt(x: number): number {
  return Math.round(x);
}

/** CNY 金额保留两位小数 */
export function round2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

export function fmt2(x: number): string {
  return round2(x).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
