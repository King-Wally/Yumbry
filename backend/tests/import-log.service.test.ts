import { afterEach, describe, expect, it, vi } from 'vitest';

const { create } = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock('../src/db/prisma.js', () => ({
  prisma: { recipeImportAttempt: { create } },
}));

const { logImportAttempt } = await import('../src/services/import-log.service.js');

describe('logImportAttempt', () => {
  afterEach(() => {
    create.mockReset();
    vi.restoreAllMocks();
  });

  it('records a successful attempt with hostname parsed from the url', async () => {
    create.mockResolvedValue(undefined);

    await logImportAttempt({ url: 'https://www.allrecipes.com/recipe/123', success: true });

    expect(create).toHaveBeenCalledWith({
      data: {
        url: 'https://www.allrecipes.com/recipe/123',
        hostname: 'www.allrecipes.com',
        success: true,
        errorKind: null,
        errorMessage: null,
      },
    });
  });

  it('records a failed attempt with the error kind and message', async () => {
    create.mockResolvedValue(undefined);

    await logImportAttempt({
      url: 'https://example.com/recipe',
      success: false,
      errorKind: 'no_recipe_found',
      errorMessage: 'No schema.org Recipe was found on that page.',
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        url: 'https://example.com/recipe',
        hostname: 'example.com',
        success: false,
        errorKind: 'no_recipe_found',
        errorMessage: 'No schema.org Recipe was found on that page.',
      },
    });
  });

  it('truncates an overly long error message before insert', async () => {
    create.mockResolvedValue(undefined);
    const longMessage = 'x'.repeat(1000);

    await logImportAttempt({
      url: 'https://example.com/recipe',
      success: false,
      errorKind: 'unknown',
      errorMessage: longMessage,
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ errorMessage: 'x'.repeat(500) }),
    });
  });

  it('falls back to the raw string as hostname when the url is not parseable', async () => {
    create.mockResolvedValue(undefined);

    await logImportAttempt({
      url: 'not-a-url',
      success: false,
      errorKind: 'validation_error',
      errorMessage: 'Provide a valid recipe page URL.',
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ url: 'not-a-url', hostname: 'not-a-url' }),
    });
  });

  it('swallows write failures and logs to console.error instead of throwing', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    create.mockRejectedValue(new Error('connection refused'));

    await expect(
      logImportAttempt({ url: 'https://example.com/recipe', success: true })
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalled();
  });
});
