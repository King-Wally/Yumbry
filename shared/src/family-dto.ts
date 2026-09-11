export interface FamilyMember {
  /** better-auth generates user ids, so these are opaque strings, not numbers.
   * Family ids stay numeric — only the user table moved to better-auth. */
  id: string;
  email: string;
}

/** A household's shared recipe collection. `invite_token` is the raw, stable
 * share token — the settings page turns it into a copyable join link. */
export interface Family {
  id: number;
  invite_token: string;
  members: FamilyMember[];
}
