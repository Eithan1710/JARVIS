"use client";
import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="card mx-auto mt-10 max-w-md p-6 text-center">
      <h2 className="text-lg font-semibold">משהו השתבש במסך הזה</h2>
      <p className="mt-2 text-sm text-muted">הנתונים שלך בטוחים. אפשר לנסות שוב.</p>
      <button onClick={reset} className="mt-4 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-ink">
        נסה שוב
      </button>
    </div>
  );
}
