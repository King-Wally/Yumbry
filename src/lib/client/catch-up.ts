import { tick } from 'svelte';
import type { Attachment } from 'svelte/attachments';

/**
 * For a control whose change handler submits its form: a value picked before hydration fired no
 * handler, so submit it now if `picked` says there is one. After a tick, so the form's
 * `use:enhance` is attached and this isn't a full-page POST.
 */
export function submitEarlyPick<T extends HTMLInputElement | HTMLSelectElement>(
	picked: (control: T) => boolean
): Attachment<T> {
	return (control) => {
		void tick().then(() => {
			if (picked(control)) control.form?.requestSubmit();
		});
	};
}
