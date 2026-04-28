/** Inclusive 95th percentile index (0-based) for n samples. */
export function percentile95Index(n: number): number {
  if (n <= 0) {
    return -1;
  }
  return Math.min(n - 1, Math.ceil(0.95 * n) - 1);
}

export function p95(values: readonly number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const idx = percentile95Index(sorted.length);
  return sorted[idx];
}
