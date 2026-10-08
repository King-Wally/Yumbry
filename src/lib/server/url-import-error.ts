export type UrlImportErrorKind =
	| 'invalid_url'
	| 'blocked_url'
	| 'timeout'
	| 'network_error'
	| 'unsupported_content_type'
	| 'too_large'
	| 'too_many_redirects'
	| 'bot_challenge'
	| 'no_jsonld'
	| 'no_recipe_found';

export class UrlImportError extends Error {
	readonly kind: UrlImportErrorKind;
	/** The target site's HTTP status, when the error came from a response it sent. */
	readonly httpStatus?: number;

	constructor(
		message: string,
		kind: UrlImportErrorKind,
		cause?: unknown,
		options?: { httpStatus?: number }
	) {
		super(message, cause !== undefined ? { cause } : undefined);
		this.name = 'UrlImportError';
		this.kind = kind;
		this.httpStatus = options?.httpStatus;
	}
}
