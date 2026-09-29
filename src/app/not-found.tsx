import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-semibold">הדף לא נמצא</h1>
      <Link href="/" className="mt-4 text-accent">
        חזרה לבית
      </Link>
    </main>
  );
}
