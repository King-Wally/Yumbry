import 'dotenv/config';
import { app } from './app.js';
import { sweepOrphanedFamilies } from './services/family.service.js';

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`Yumbry listening on port ${PORT}`);
});

// better-auth's user-create hook writes the personal family before the user row,
// so a failed signup (duplicate email) can leave an empty family behind. They are
// harmless but accumulate, so clear them once at startup. Expired password-reset
// tokens no longer need sweeping — better-auth expires its own verification rows.
sweepOrphanedFamilies().catch((err) => {
  console.error('Failed to sweep orphaned families', err);
});
