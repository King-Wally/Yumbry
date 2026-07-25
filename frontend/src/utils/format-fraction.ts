/** Formats a decimal amount rounded to the nearest eighth as a comma-decimal string, e.g. 1.5 -> "1,5". */
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
