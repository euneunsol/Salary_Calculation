export function minimumWageFor(date: string): number {
  if (date >= '2027-01-01') return 10_700;
  if (date >= '2026-01-01') return 10_320;
  return 10_030;
}

export function validateWage(wage: number, effectiveFrom: string): string | null {
  if (!Number.isInteger(wage)) return '시급은 원 단위 정수로 입력해주세요.';
  const minimum = minimumWageFor(effectiveFrom);
  if (wage < minimum) return `${effectiveFrom.slice(0, 4)}년 최저시급 ${minimum.toLocaleString()}원 이상이어야 합니다.`;
  return null;
}
