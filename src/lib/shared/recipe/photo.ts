import { m } from '#lib/paraglide/messages.js';

/** Ceiling for an original as the camera wrote it; what is stored is re-encoded far smaller.
 * `BODY_SIZE_LIMIT` (30M in the Dockerfile and the e2e config) leaves room for multipart overhead.
 * The photo picker checks it too, to refuse an oversized file before uploading it. */
export const PHOTO_LIMIT_MB = 25;

/** Why an upload can't be taken as a photo, judged from what it declares itself as. */
export type PhotoRefusal = 'missing' | 'unsupported_type' | 'too_large';

/** Why a photo upload failed: a refusal, or bytes that can't be decoded as an image. */
export type PhotoError = PhotoRefusal | 'unreadable_image';

export function photoErrorMessage(kind: PhotoError): string {
	switch (kind) {
		case 'missing':
			return m.photo_error_missing();
		case 'unsupported_type':
			return m.photo_error_unsupported_type();
		case 'too_large':
			return m.photo_error_too_large({ limitMb: PHOTO_LIMIT_MB });
		case 'unreadable_image':
			return m.photo_error_unreadable_image();
	}
}
