export default function NotFound() {
  return (
    <main className="relative z-10 flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center">
      <h1 className="display text-5xl text-ink">הדף הזה לא קיים</h1>
      <a href="/" className="mt-4 text-arc underline underline-offset-4">
        חזרה ל־JARVIS
      </a>
    </main>
  );
}
