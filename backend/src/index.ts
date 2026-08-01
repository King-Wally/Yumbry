import 'dotenv/config';
import { app } from './app.js';
import { seedAiSettingsFromEnv } from './services/ai-settings.service.js';

const PORT = Number(process.env.PORT) || 3000;

await seedAiSettingsFromEnv();

app.listen(PORT, () => {
  console.log(`Recipe Vault listening on port ${PORT}`);
});
