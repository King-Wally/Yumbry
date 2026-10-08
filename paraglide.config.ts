import type { CompilerOptions } from '@inlang/paraglide-js';

/**
 * Paraglide's compiler options, shared by the Vite plugin and `scripts/paraglide-compile.ts` (the
 * `prepare` script) so both generate the same runtime. The CLI's flags can't set `cookieName`.
 */
export const paraglideOptions = {
	project: './project.inlang',
	outdir: './src/lib/paraglide',
	emitTsDeclarations: true,
	// No locale in URLs. The signed-in user's saved language wins (#lib/server/locale.ts), then the
	// visitor's own choice, then the browser's languages.
	strategy: ['custom-session', 'cookie', 'preferredLanguage', 'baseLocale'],
	cookieName: 'yumbry-locale'
} satisfies CompilerOptions;
