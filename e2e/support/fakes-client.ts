import { expect } from '@playwright/test';
import { DEFAULT_RECIPE, DEFAULT_REPLY } from '../fakes/defaults.ts';
import { env } from './env.ts';

export interface RecordedRequest {
  backend: 'openrouter' | 'gemini';
  model: string;
  body: { messages?: { role: string; content: unknown }[] } & Record<string, unknown>;
}

export interface CapturedEmail {
  to: string[];
  subject: string;
  text: string;
  html: string;
}

type RecipeEnvelope = typeof DEFAULT_RECIPE;

/** Typed wrapper around the fakes server's /__control API. */
export class FakesClient {
  constructor(private readonly baseUrl = env.fakesUrl) {}

  /** The next LLM request whose body contains `key` gets this response instead of the default. */
  async queue(key: string, response: { status?: number; content?: unknown }): Promise<void> {
    const res = await fetch(`${this.baseUrl}/__control/queue`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key, ...response }),
    });
    expect(res.ok, 'queueing a fake response').toBe(true);
  }

  /** Queues a chat/photo envelope; `recipe` fields override the default draft. */
  async queueRecipe(
    key: string,
    recipe: Partial<RecipeEnvelope> | null,
    reply = DEFAULT_REPLY
  ): Promise<void> {
    await this.queue(key, {
      content: { reply, recipe: recipe === null ? null : { ...DEFAULT_RECIPE, ...recipe } },
    });
  }

  async requests(contains: string): Promise<RecordedRequest[]> {
    const res = await fetch(
      `${this.baseUrl}/__control/requests?contains=${encodeURIComponent(contains)}`
    );
    return (await res.json()) as RecordedRequest[];
  }

  async emailsTo(address: string): Promise<CapturedEmail[]> {
    const res = await fetch(`${this.baseUrl}/__control/emails?to=${encodeURIComponent(address)}`);
    return (await res.json()) as CapturedEmail[];
  }

  /** Waits for the password reset email to `address` and returns the link inside it. */
  async resetLinkFor(address: string): Promise<string> {
    let link: string | undefined;
    await expect
      .poll(async () => {
        const emails = await this.emailsTo(address);
        link = emails.at(-1)?.text.match(/https?:\/\/\S+\/reset-password\?token=[^\s"<]+/)?.[0];
        return link;
      }, 'password reset email')
      .toBeTruthy();
    return link!;
  }
}
