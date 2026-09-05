export interface FamilyMember {
  id: number;
  email: string;
}

/** A household's shared recipe collection. `invite_token` is the raw, stable
 * share token — the settings page turns it into a copyable join link. */
export interface Family {
  id: number;
  invite_token: string;
  members: FamilyMember[];
}
