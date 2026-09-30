// The full app's URL-import browser: CloakBrowser (stealth-patched Chromium) exposing CDP, the
// same thing the compose `browser` sidecar runs with `cloakserve`, minus Docker.
import { launch } from 'cloakbrowser';
import { env } from '../support/env.ts';

const browser = await launch({
  headless: true,
  locale: 'en-US',
  args: [`--remote-debugging-port=${env.browserPort}`, '--remote-debugging-address=127.0.0.1'],
});

const shutdown = () => void browser.close().finally(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
