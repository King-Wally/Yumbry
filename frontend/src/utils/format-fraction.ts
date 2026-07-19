const VULGAR_FRACTIONS: Record<string, string> = {
  '1/8': '⅛',
  '1/4': '¼',
  '3/8': '⅜',
  '1/2': '½',
  '5/8': '⅝',
  '3/4': '¾',
  '7/8': '⅞',
};

/** Formats a decimal amount as a whole number + a rounded-to-nearest-eighth unicode fraction, e.g. 1.5 -> "1 ½". */
export function formatFraction(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '';

  const whole = Math.floor(amount);
  const remainder = amount - whole;
  const eighths = Math.round(remainder * 8);

  if (eighths === 0) return String(whole);
  if (eighths === 8) return String(whole + 1);

  const numerator = eighths;
  const denominator = 8;
  const divisor = gcd(numerator, denominator);
  const key = `${numerator / divisor}/${denominator / divisor}`;
  const fraction = VULGAR_FRACTIONS[key] || key;

  return whole > 0 ? `${whole} ${fraction}` : fraction;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
