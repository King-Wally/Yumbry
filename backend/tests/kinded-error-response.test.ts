import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { sendKindedError } from '../src/utils/kinded-error-response.js';

type TestKind = 'a' | 'b';

class TestError extends Error {
  readonly kind: TestKind;
  constructor(message: string, kind: TestKind) {
    super(message);
    this.kind = kind;
  }
}

const STATUS_BY_KIND: Record<TestKind, number> = { a: 400, b: 502 };

function mockRes() {
  const res = { status: vi.fn(), json: vi.fn() } as unknown as Response;
  vi.mocked(res.status).mockReturnValue(res);
  return res;
}

describe('sendKindedError', () => {
  it('responds with the status/body for a matching error kind', () => {
    const res = mockRes();
    sendKindedError(res, new TestError('bad input', 'a'), TestError, STATUS_BY_KIND);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'bad input', kind: 'a' });
  });

  it('looks up a different status for a different kind', () => {
    const res = mockRes();
    sendKindedError(res, new TestError('upstream failed', 'b'), TestError, STATUS_BY_KIND);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({ error: 'upstream failed', kind: 'b' });
  });

  it('rethrows an error that is not an instance of ErrorClass unchanged', () => {
    const res = mockRes();
    const other = new Error('unrelated');

    expect(() => sendKindedError(res, other, TestError, STATUS_BY_KIND)).toThrow(other);
    expect(res.status).not.toHaveBeenCalled();
  });
});
