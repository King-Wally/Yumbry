const DURATION_PATTERN = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

/**
 * Converts an ISO 8601 duration string (e.g. "PT1H30M") to whole minutes.
 * Returns null if the input is missing or doesn't match the expected format.
 */
export function isoDurationToMinutes(duration: unknown): number | null {
  if (typeof duration !== 'string') return null;

  const match = DURATION_PATTERN.exec(duration.trim());
  if (!match) return null;

  const [, days, hours, minutes, seconds] = match;
  if (!days && !hours && !minutes && !seconds) return null;

  const totalMinutes =
    (Number(days) || 0) * 24 * 60 +
    (Number(hours) || 0) * 60 +
    (Number(minutes) || 0) +
    (Number(seconds) || 0) / 60;

  return Math.round(totalMinutes);
}

/**
 * Converts whole minutes to an ISO 8601 duration string (e.g. 90 -> "PT1H30M").
 * Returns undefined for null/missing/non-positive input.
 */
export function minutesToIsoDuration(minutes: number | null | undefined): string | undefined {
  if (minutes == null || minutes <= 0) return undefined;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0 && remainingMinutes === 0) return undefined;

  return `PT${hours > 0 ? `${hours}H` : ''}${remainingMinutes > 0 ? `${remainingMinutes}M` : ''}`;
}
