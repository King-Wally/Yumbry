import { describe, expect, it } from 'vitest';
import {
  celsiusToFahrenheit,
  fahrenheitToCelsius,
  OVEN_TEMPERATURES,
} from '../../src/units/convert.js';

describe('oven temperatures', () => {
  it('reads the table exactly in both directions', () => {
    for (const { c, f } of OVEN_TEMPERATURES) {
      expect(celsiusToFahrenheit(c)).toBe(f);
      expect(fahrenheitToCelsius(f)).toBe(c);
    }
  });

  it('maps the gas-mark landmarks a cook actually types', () => {
    expect(celsiusToFahrenheit(180)).toBe(350);
    expect(celsiusToFahrenheit(190)).toBe(375);
    expect(celsiusToFahrenheit(200)).toBe(400);
    expect(fahrenheitToCelsius(350)).toBe(180);
    expect(fahrenheitToCelsius(425)).toBe(220);
  });

  it('snaps an off-table oven temperature to the nearest row', () => {
    expect(celsiusToFahrenheit(177)).toBe(350);
    expect(celsiusToFahrenheit(175)).toBe(350);
    expect(fahrenheitToCelsius(360)).toBe(180);
  });

  // Raw arithmetic drifts: 180 C -> 356 -> snapped 350 F -> 176.7 -> snapped 175 C. A reader
  // toggling the setting back and forth must not watch their oven cool down.
  it('does not drift across repeated round trips', () => {
    for (const { c } of OVEN_TEMPERATURES) {
      let celsius = c;
      for (let pass = 0; pass < 5; pass += 1) {
        celsius = fahrenheitToCelsius(celsiusToFahrenheit(celsius));
      }
      expect(celsius).toBe(c);
    }
  });
});

describe('below the oven band', () => {
  // 5 C of slack is a food-safety error down here, not a rounding preference.
  it('keeps meat temperatures to the degree', () => {
    expect(fahrenheitToCelsius(165)).toBe(74);
    expect(fahrenheitToCelsius(145)).toBe(63);
    expect(fahrenheitToCelsius(160)).toBe(71);
  });

  it('round-trips low temperatures', () => {
    for (const fahrenheit of [120, 145, 150, 160, 165, 180, 200]) {
      expect(celsiusToFahrenheit(fahrenheitToCelsius(fahrenheit))).toBe(fahrenheit);
    }
  });

  it('stays stable across the boundary into the oven table', () => {
    expect(celsiusToFahrenheit(99)).toBe(210);
    expect(fahrenheitToCelsius(210)).toBe(99);
    expect(celsiusToFahrenheit(100)).toBe(212);
  });
});
