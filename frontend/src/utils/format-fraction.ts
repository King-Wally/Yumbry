export function formatFraction(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '';

  const whole = Math.floor(amount);
  const remainder = amount - whole;
  const eighths = Math.round(remainder * 8);

  if (eighths === 0) return String(whole);
  if (eighths === 8) return String(whole + 1);

  const value = whole + eighths / 8;

  return value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',');
}
