// The e2e package keeps its own style (the one it was written in on main), separate from the
// app's tabs-based config at the repo root.
/** @type {import("prettier").Config} */
export default {
  singleQuote: true,
  semi: true,
  printWidth: 100,
  trailingComma: 'es5',
};
