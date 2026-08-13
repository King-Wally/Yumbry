/**
 * How a metric recipe writes a small volume.
 *
 * Both forms are idiomatic — a Flemish recipe says "1 tl zout" as readily as "45 ml vissaus" —
 * so this is a genuine preference rather than a correctness question, and the cook owns it. It is
 * also the one measurement decision the AI cannot make on their behalf: the model always writes
 * canonical millilitres, and how that reaches the page is decided here.
 *
 * Metric only. Imperial has no alternative to spoons at these sizes, so the setting has no effect
 * on an imperial reader.
 */
export const SMALL_VOLUME_STYLES = ['spoons', 'millilitres'] as const;

export type SmallVolumeStyle = (typeof SMALL_VOLUME_STYLES)[number];

export const DEFAULT_SMALL_VOLUME_STYLE: SmallVolumeStyle = 'spoons';

export function isSmallVolumeStyle(value: unknown): value is SmallVolumeStyle {
  return typeof value === 'string' && (SMALL_VOLUME_STYLES as readonly string[]).includes(value);
}
