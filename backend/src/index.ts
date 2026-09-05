import 'dotenv/config';
import { app } from './app.js';
import { cleanupPasswordResetTokens } from './services/auth.service.js';

const PORT = Number(process.env.PORT) || 3000;
const PASSWORD_RESET_TOKEN_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

app.listen(PORT, () => {
  console.log(`Yumbry listening on port ${PORT}`);
});

function runPasswordResetTokenCleanup(): void {
  cleanupPasswordResetTokens().catch((err) => {
    console.error('Failed to clean up password reset tokens', err);
  });
}

// Run once at startup, then on a fixed interval. unref() so this timer never keeps the
// process alive on its own (e.g. during shutdown).
runPasswordResetTokenCleanup();
setInterval(runPasswordResetTokenCleanup, PASSWORD_RESET_TOKEN_CLEANUP_INTERVAL_MS).unref();
