/** Builds a `($1, $2), ($3, $4), ...` VALUES clause for a batched multi-row insert. */
export function insertValuesClause(rowCount: number, columnsPerRow: number, startAt = 1): string {
  return Array.from({ length: rowCount }, (_, row) => {
    const base = startAt + row * columnsPerRow;
    const placeholders = Array.from({ length: columnsPerRow }, (_, col) => `$${base + col}`);
    return `(${placeholders.join(', ')})`;
  }).join(', ');
}
