export type FamilyErrorKind = 'invalid_invite' | 'already_member' | 'nothing_to_leave';

/** A join or leave the family service refuses. The message is shown to the user as-is. */
export class FamilyError extends Error {
	readonly kind: FamilyErrorKind;

	constructor(message: string, kind: FamilyErrorKind) {
		super(message);
		this.name = 'FamilyError';
		this.kind = kind;
	}
}
