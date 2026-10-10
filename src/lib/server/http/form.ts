/** A text field from submitted form data, or '' when it is missing or a file. */
export function formString(data: FormData, name: string): string {
	const value = data.get(name);
	return typeof value === 'string' ? value : '';
}
