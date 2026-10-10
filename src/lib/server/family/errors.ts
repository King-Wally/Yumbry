export type FamilyErrorKind = 'invalid_invite' | 'already_member' | 'nothing_to_leave';

/** A join or leave the family service refuses. The message is for the logs; the user reads the
 * kind's translated message (#lib/server/http/kinded-errors.ts). */
export class FamilyError extends Error {
	readonly kind: FamilyErrorKind;

	constructor(message: string, kind: FamilyErrorKind) {
		super(message);
		this.name = 'FamilyError';
		this.kind = kind;
	}
}
