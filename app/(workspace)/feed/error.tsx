"use client";

export default function FeedError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="px-4 py-10">
      <p className="font-medium">The feed did not load.</p>
      <button type="button" className="mt-3 text-primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
