export interface ExportFile {
  blob: Blob;
  filename: string;
}

/** Fetches the export ahead of the click that shares/downloads it — call this as soon
 *  as the recipe is available, NOT inside the click handler. navigator.share() must run
 *  synchronously off the click event with no prior await, or WebKit drops "user
 *  activation" and share() fails with NotAllowedError. */
export async function fetchExportFile(url: string, fallbackFilename: string): Promise<ExportFile> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`Request failed with status ${res.status}`);

  const filename =
    filenameFromContentDisposition(res.headers.get('Content-Disposition')) ?? fallbackFilename;
  const blob = await res.blob();
  return { blob, filename };
}

/** Call directly from an onClick handler (no leading await) against an already-fetched
 *  ExportFile, so the share sheet still counts as a direct response to user input.
 *  Falls back to a Blob-anchor download when the Web Share API isn't available (or
 *  fails for a reason other than the user dismissing it) — this is the path standalone
 *  iOS PWAs need to avoid getting trapped on the OS "Quick Look" screen that a plain
 *  `<a href download>` navigation opens in that context. */
export function shareOrDownloadFile({ blob, filename }: ExportFile): Promise<void> {
  const file = new File([blob], filename, { type: blob.type || 'application/json' });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };

  if (nav.canShare?.({ files: [file] })) {
    return navigator.share({ files: [file] }).catch((err: unknown) => {
      if (err instanceof DOMException && err.name === 'AbortError') return; // user dismissed the sheet
      downloadBlob(blob, filename); // share failed for some other reason — fall back
    });
  }

  downloadBlob(blob, filename);
  return Promise.resolve();
}

function filenameFromContentDisposition(header: string | null): string | null {
  return header ? (/filename="?([^";]+)"?/i.exec(header)?.[1] ?? null) : null;
}

function downloadBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
