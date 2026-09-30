"use client";

/** Read a reply aloud with the device's own Hebrew voice (free, on-device). */
export function speak(markdown: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_#>`~|]/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
  if (!text) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const hebrew = /[֐-׿]/.test(text);
  u.lang = hebrew ? "he-IL" : "en-US";
  const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(hebrew ? "he" : "en"));
  if (voice) u.voice = voice;
  u.rate = 1.03;
  synth.speak(u);
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}
