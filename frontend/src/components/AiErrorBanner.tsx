interface AiErrorBannerProps {
  error: Error;
}

export default function AiErrorBanner({ error }: AiErrorBannerProps) {
  return (
    <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
      {error.message}
    </p>
  );
}
