import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { families, users } from '#lib/server/db/schema.ts';
import {
	closeTestDatabase,
	describeDb,
	insertFamily,
	insertUser,
	resetTestDatabase,
	testDb
} from '#lib/server/testing/db.ts';

vi.mock('#lib/server/db/index.ts', async () => {
	const { testDb } = await import('#lib/server/testing/db.ts');
	return {
		get db() {
			return testDb();
		}
	};
});

const { getFamily } = await import('#lib/server/services/family.ts');

describeDb('getFamily', () => {
	beforeAll(resetTestDatabase);
	afterAll(closeTestDatabase);

	it('lists the members oldest account first, with the invite token', async () => {
		const family = await insertFamily();
		const newer = await insertUser(family);
		const older = await insertUser(family);
		await testDb()
			.update(users)
			.set({ createdAt: new Date('2020-01-01') })
			.where(eq(users.id, older));
		await insertUser(await insertFamily());

		const [{ inviteToken }] = await testDb()
			.select({ inviteToken: families.inviteToken })
			.from(families)
			.where(eq(families.id, family));
		const result = await getFamily(family);

		expect(result).toEqual({
			id: family,
			invite_token: inviteToken,
			members: [
				{ id: older, email: `${older}@example.test` },
				{ id: newer, email: `${newer}@example.test` }
			]
		});
	});

	it('returns null for a family that does not exist', async () => {
		expect(await getFamily(999_999)).toBeNull();
	});
});
