import { useRef, type ChangeEvent } from 'react';

interface ImageUploadProps {
  currentUrl?: string | null;
  onUpload: (file: File) => void;
  label?: string;
}

export default function ImageUpload({ currentUrl, onUpload, label = 'Photo' }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
    e.target.value = '';
  }

  return (
    <div className="flex items-center gap-3">
      {currentUrl && (
        <img
          src={currentUrl}
          alt={label}
          loading="lazy"
          decoding="async"
          className="h-16 w-16 rounded object-cover"
        />
      )}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100"
      >
        {currentUrl ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}
