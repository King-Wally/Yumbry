// Whether the page has hydrated. The server renders working-looking controls, but one that only does
// something in the browser ignores a click until then: such a control is disabled while this is
// false (Playwright waits for it to be enabled). Set once, from the root layout's onMount, which runs
// after every page and component below it has mounted.
let value = $state(false);

export const hydrated = {
	get current(): boolean {
		return value;
	}
};

export function markHydrated(): void {
	value = true;
}
