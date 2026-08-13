import { snap } from './rounding.js';

/**
 * Oven temperatures are a bijection table, not arithmetic.
 *
 * Raw math is not stable under a round trip: 180 C -> 356 F -> snapped to 350 F -> 176.7 C ->
 * snapped to 175 C. A reader toggling the unit setting would watch their oven drift downward. A
 * table read in either direction gives f(g(x)) === x exactly, forever.
 *
 * Ordered ascending; ties on distance take the lower row.
 */
export const OVEN_TEMPERATURES: { c: number; f: number }[] = [
  { c: 100, f: 212 },
  { c: 110, f: 225 },
  { c: 120, f: 250 },
  { c: 140, f: 275 },
  { c: 150, f: 300 },
  { c: 160, f: 325 },
  { c: 180, f: 350 },
  { c: 190, f: 375 },
  { c: 200, f: 400 },
  { c: 220, f: 425 },
  { c: 230, f: 450 },
  { c: 240, f: 475 },
  { c: 260, f: 500 },
];

// The thresholds are the table's own lowest row in each scale, so a value just below the oven band
// converts by arithmetic in both directions and stays stable across the boundary.
const OVEN_MIN_C = OVEN_TEMPERATURES[0].c;
const OVEN_MIN_F = OVEN_TEMPERATURES[0].f;

function nearestRow(scale: 'c' | 'f', value: number): { c: number; f: number } {
  let best = OVEN_TEMPERATURES[0];
  let bestDistance = Math.abs(value - best[scale]);

  for (const row of OVEN_TEMPERATURES) {
    const distance = Math.abs(value - row[scale]);
    if (distance < bestDistance) {
      best = row;
      bestDistance = distance;
    }
  }

  return best;
}

/**
 * Below the oven band we are in meat and dough territory, where 5 C is a food-safety error rather
 * than a rounding preference — 165 F is the USDA poultry temperature and must come back as 74 C,
 * not 75. So: Celsius to the nearest 1, Fahrenheit to the nearest 5.
 */
export function celsiusToFahrenheit(celsius: number): number {
  if (celsius >= OVEN_MIN_C) return nearestRow('c', celsius).f;
  return snap((celsius * 9) / 5 + 32, 5);
}

export function fahrenheitToCelsius(fahrenheit: number): number {
  if (fahrenheit >= OVEN_MIN_F) return nearestRow('f', fahrenheit).c;
  return Math.round(((fahrenheit - 32) * 5) / 9);
}
