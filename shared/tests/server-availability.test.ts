import { describe, expect, it } from 'vitest';
import { isServerUnavailableResponse } from '../src/server-availability.js';

describe('isServerUnavailableResponse', () => {
  it.each([502, 503, 504, 520, 523, 530])('treats a non-JSON %i as unavailable', (status) => {
    expect(isServerUnavailableResponse(status, false)).toBe(true);
  });

  it('does not treat a JSON 503 as unavailable', () => {
    expect(isServerUnavailableResponse(503, true)).toBe(false);
  });

  it.each([200, 400, 401, 404, 500, 501, 519, 524, 531])('ignores %i', (status) => {
    expect(isServerUnavailableResponse(status, false)).toBe(false);
  });
});
