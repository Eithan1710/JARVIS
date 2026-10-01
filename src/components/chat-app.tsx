"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, Chip, ClientAction, ConversationSummary, Step, StreamEvent } from "@/lib/protocol";
import { ApiError, apiGet, apiSend, apiUpload } from "@/client/api";
import { registerServiceWorker, usePush } from "@/client/push";
import { speak, stopSpeaking } from "@/client/speech";
import { streamChat } from "@/client/stream";
import { useRecorder } from "@/client/voice";
import type { IconName } from "@/lib/protocol";
import { Composer } from "./composer";
import { Core } from "./core";
import { Drawer } from "./drawer";
import { Icon } from "./icons";
import { ActionCards, Chips, DaySeparator, JarvisMessage, StepList, UserMessage } from "./message-view";
import { Orb } from "./orb";
import { VoiceOverlay } from "./voice-overlay";

const LAST_KEY = "jarvis.conversation";
/** After this long without activity, JARVIS opens on a fresh screen (the old thread stays in history). */
const FRESH_AFTER_MS = 6 * 60 * 60 * 1000;

function greeting() {
  const h = new Date().getHours();
  return h >= 5 && h < 12 ? "בוקר טוב" : h >= 12 && h < 17 ? "צהריים טובים" : h >= 17 && h < 22 ? "ערב טוב" : "לילה טוב";
}

/** Starting points — tapping one drops a ready-to-edit sentence into the composer. */
const IDEAS: { icon: IconName; title: string; text: string; color: string }[] = [
  { icon: "bell", title: "תזכורת", text: "תזכיר לי היום ב־20:00 ", color: "#ffad5c" },
  { icon: "repeat", title: "הרגל חדש", text: "אני רוצה לבנות הרגל של ", color: "#5ef0b4" },
  { icon: "target", title: "יעד", text: "היעד שלי: ", color: "#8b6cff" },
  { icon: "map", title: "ניווט", text: "תפתח לי ניווט ל", color: "#3fd8ff" },
  { icon: "music", title: "מוזיקה", text: "תפתח לי ב־Spotify ", color: "#3be37f" },
  { icon: "globe", title: "מחקר", text: "תבדוק לי ", color: "#ff7fd6" },
];

interface Live {
  steps: Step[];
  actions: ClientAction[];
  chips: Chip[];
}

export function ChatApp({ lockable }: { lockable: boolean }) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<Live | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [hello, setHello] = useState("");
  const [showPushHint, setShowPushHint] = useState(false);

  const recorder = useRecorder();
  const push = usePush();
  const scroller = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const lastSync = useRef(new Date().toISOString());
  const convRef = useRef<string | null>(null);
  convRef.current = conversationId;

  /* ─────────────── bootstrap ─────────────── */

  const openConversation = useCallback(async (id: string, opts: { quiet?: boolean } = {}) => {
    try {
      const data = await apiGet<{ conversation: { id: string }; messages: ChatMessage[] }>(`/api/conversations/${id}`);
      setConversationId(data.conversation.id);
      setMessages(data.messages);
      localStorage.setItem(LAST_KEY, data.conversation.id);
      history.replaceState(null, "", `/?c=${data.conversation.id}`);
      return data.messages;
    } catch (e) {
      if (!opts.quiet) setNotice(e instanceof ApiError ? e.message : "לא הצלחתי לטעון את השיחה");
      return null;
    }
  }, []);

  useEffect(() => {
    registerServiceWorker();
    setHello(greeting());
    const params = new URLSearchParams(location.search);
    const fromUrl = params.get("c");
    const stored = localStorage.getItem(LAST_KEY);
    void (async () => {
      if (fromUrl) await openConversation(fromUrl, { quiet: true });
      else if (stored) {
        const msgs = await openConversation(stored, { quiet: true });
        const last = msgs?.at(-1);
        if (msgs && (!last || Date.now() - new Date(last.createdAt).getTime() > FRESH_AFTER_MS)) {
          setConversationId(null);
          setMessages([]);
          history.replaceState(null, "", "/");
        }
      }
      setLoaded(true);
    })();

    const onSw = (e: MessageEvent) => {
      if (e.data?.type === "NAVIGATE" && typeof e.data.url === "string") {
        const c = new URL(e.data.url, location.origin).searchParams.get("c");
        if (c) void openConversation(c);
      }
    };
    navigator.serviceWorker?.addEventListener("message", onSw);
    return () => navigator.serviceWorker?.removeEventListener("message", onSw);
  }, [openConversation]);

  /* ─────────────── proactive messages (reminders etc.) ─────────────── */

  useEffect(() => {
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await apiGet<{ messages: (ChatMessage & { conversationId: string })[]; now: string }>(`/api/updates?since=${encodeURIComponent(lastSync.current)}`);
        lastSync.current = res.now;
        const mine = res.messages.filter((m) => m.conversationId === convRef.current);
        if (mine.length) {
          setMessages((prev) => [...prev, ...mine.filter((m) => !prev.some((p) => p.id === m.id))]);
          setFreshId(mine.at(-1)!.id);
        } else if (res.messages.length) {
          const m = res.messages.at(-1)!;
          setNotice(m.content.replace(/[*#]/g, "").slice(0, 80));
        }
      } catch {
        /* offline — try again later */
      }
    };
    const t = setInterval(poll, 20_000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", poll);
    };
  }, []);

  /* ─────────────── scrolling ─────────────── */

  const nearBottom = useRef(true);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => {
      nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
      setAtBottom(nearBottom.current);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [loaded]);

  useEffect(() => {
    const el = scroller.current;
    if (el && nearBottom.current) el.scrollTo({ top: el.scrollHeight, behavior: messages.length > 1 ? "smooth" : "auto" });
  }, [messages, live]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  /* ─────────────── sending ─────────────── */

  const send = useCallback(
    async (raw: string, inputMode: "text" | "voice" = "text") => {
      const content = raw.trim();
      if (!content || busy) return;
      stopSpeaking();
      setBusy(true);
      setText("");
      nearBottom.current = true;
      const tempId = `local-${Date.now()}`;
      setMessages((prev) => [...prev, { id: tempId, role: "user", content, kind: "chat", inputMode, createdAt: new Date().toISOString() }]);
      const state: Live = { steps: [], actions: [], chips: [] };
      setLive({ ...state });
      const ctrl = new AbortController();
      abort.current = ctrl;

      const onEvent = (e: StreamEvent) => {
        switch (e.type) {
          case "meta":
            setConversationId(e.conversationId);
            localStorage.setItem(LAST_KEY, e.conversationId);
            if (convRef.current !== e.conversationId) history.replaceState(null, "", `/?c=${e.conversationId}`);
            convRef.current = e.conversationId;
            setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, id: e.userMessageId } : m)));
            break;
          case "step": {
            const i = state.steps.findIndex((s) => s.id === e.step.id);
            if (i >= 0) state.steps[i] = e.step;
            else state.steps.push(e.step);
            setLive({ ...state, steps: [...state.steps] });
            break;
          }
          case "action":
            state.actions.push(e.action);
            setLive({ ...state, actions: [...state.actions] });
            break;
          case "chip":
            state.chips.push(e.chip);
            setLive({ ...state, chips: [...state.chips] });
            if ((e.chip.icon === "bell" || e.chip.icon === "repeat" || e.chip.icon === "target") && (push.state === "prompt" || push.state === "ios-needs-install")) setShowPushHint(true);
            break;
          case "reply":
            setMessages((prev) => [
              ...prev,
              { id: e.messageId, role: "assistant", content: e.text, kind: "chat", inputMode: "text", createdAt: e.createdAt, steps: [...state.steps], actions: [...state.actions], chips: [...state.chips] },
            ]);
            setFreshId(e.messageId);
            setLive(null);
            setBusy(false);
            if (inputMode === "voice") speak(e.text);
            break;
          case "title":
            setConversations((prev) => prev && prev.map((c) => (c.id === e.conversationId ? { ...c, title: e.title } : c)));
            break;
          case "error":
            setNotice(e.message);
            break;
          case "done":
            break;
        }
      };

      try {
        await streamChat({ conversationId: convRef.current, text: content, inputMode }, onEvent, ctrl.signal);
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) setNotice("החיבור נקטע. ההודעה נשמרה — נסה לשלוח שוב.");
      } finally {
        setLive(null);
        setBusy(false);
        abort.current = null;
        setConversations(null);
      }
    },
    [busy, push.state],
  );

  const cancelWork = useCallback(() => {
    abort.current?.abort();
    setNotice("עצרתי. אם התחלתי משהו, הוא עדיין נשמר.");
  }, []);

  /* ─────────────── voice ─────────────── */

  const onMic = useCallback(async () => {
    stopSpeaking();
    const res = await recorder.start();
    if (res !== "ok") setNotice(res === "unsupported" ? "הדפדפן הזה לא תומך בהקלטה" : "צריך לאשר גישה למיקרופון כדי לדבר איתי");
  }, [recorder]);

  const onStopRecording = useCallback(
    async (sendIt: boolean) => {
      const blob = await recorder.stop(!sendIt);
      if (!sendIt || !blob) return;
      if (blob.size < 1500) {
        setNotice("ההקלטה קצרה מדי");
        return;
      }
      setTranscribing(true);
      try {
        const form = new FormData();
        form.append("audio", blob, blob.type.includes("mp4") ? "voice.m4a" : "voice.webm");
        const { text: transcript } = await apiUpload<{ text: string }>("/api/voice", form);
        setTranscribing(false);
        await send(transcript, "voice");
      } catch (e) {
        setNotice(e instanceof ApiError ? e.message : "לא הצלחתי לתמלל. נסה שוב.");
      } finally {
        setTranscribing(false);
      }
    },
    [recorder, send],
  );

  // Space bar (desktop) toggles push-to-talk when the composer is empty and not focused.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.code !== "Space" || tag === "TEXTAREA" || tag === "INPUT" || busy || transcribing) return;
      e.preventDefault();
      if (recorder.state === "recording") void onStopRecording(true);
      else void onMic();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, transcribing, recorder.state, onMic, onStopRecording]);

  /* ─────────────── drawer ─────────────── */

  const openDrawer = useCallback(async () => {
    setDrawerOpen(true);
    try {
      const res = await apiGet<{ conversations: ConversationSummary[] }>("/api/conversations");
      setConversations(res.conversations);
    } catch {
      setConversations([]);
    }
  }, []);

  const newConversation = useCallback(() => {
    stopSpeaking();
    setConversationId(null);
    setMessages([]);
    setDrawerOpen(false);
    localStorage.removeItem(LAST_KEY);
    history.replaceState(null, "", "/");
    window.dispatchEvent(new Event("jarvis:focus-composer"));
  }, []);

  const archive = useCallback(
    async (id: string) => {
      await apiSend("DELETE", `/api/conversations/${id}`).catch(() => {});
      setConversations((prev) => prev?.filter((c) => c.id !== id) ?? null);
      if (id === conversationId) newConversation();
    },
    [conversationId, newConversation],
  );

  const lock = useCallback(async () => {
    await apiSend("POST", "/api/auth/lock").catch(() => {});
    location.href = "/unlock";
  }, []);

  /* ─────────────── render ─────────────── */

  const listening = recorder.state === "recording";
  const working = busy || transcribing;
  const empty = loaded && messages.length === 0 && !busy;
  const runningStep = live?.steps.filter((st) => st.state === "running").at(-1);
  const statusText = runningStep?.label ?? (live?.steps.length ? "מסכם…" : "חושב…");

  const withSeparators = useMemo(() => {
    const out: { m: ChatMessage; sep: boolean }[] = [];
    let lastDay = "";
    for (const m of messages) {
      const day = new Date(m.createdAt).toDateString();
      out.push({ m, sep: day !== lastDay && out.length > 0 });
      lastDay = day;
    }
    return out;
  }, [messages]);

  const pushHint =
    showPushHint && push.state === "prompt" ? (
      <button
        type="button"
        onClick={async () => {
          const msg = await push.subscribe();
          if (msg) setNotice(msg);
          setShowPushHint(false);
        }}
        className="glass rise inline-flex items-center gap-2.5 rounded-full py-2 ps-2 pe-4 text-[0.9rem] text-ink-2 hover:bg-glass-2"
      >
        <span className="grid size-7 place-items-center rounded-full bg-solar/20 text-solar">
          <Icon name="bell" size={15} />
        </span>
        הפעל התראות כדי שהתזכורות יגיעו גם כשהאפליקציה סגורה
      </button>
    ) : showPushHint && push.state === "ios-needs-install" ? (
      <p className="glass rise rounded-2xl px-4 py-3 text-[0.88rem] text-ink-2">כדי לקבל תזכורות באייפון: שתף ← ״הוסף למסך הבית״, ואז פתח את JARVIS משם.</p>
    ) : null;

  return (
    <div className="relative z-10 flex h-[100dvh] flex-col">
      <div className="edge-glow" data-on={listening || working ? "true" : "false"} data-mode={listening ? "listening" : "working"} aria-hidden />

      <header className="relative z-20 shrink-0" style={{ paddingTop: "var(--safe-top)" }}>
        <div className="mx-auto flex h-16 w-full max-w-[var(--column)] items-center justify-between px-2.5 sm:px-3">
          <button type="button" onClick={openDrawer} className="glass grid size-11 place-items-center rounded-full text-ink-2 transition-colors hover:text-ink" aria-label="שיחות">
            <Icon name="menu" size={21} />
          </button>
          <div className={`flex items-center gap-2.5 transition-all duration-500 ${empty ? "translate-y-1 opacity-0" : "opacity-100"}`} dir="ltr">
            <Core size={20} state={working ? "thinking" : "idle"} />
            <span className="wordmark text-[0.8rem] text-ink">JARVIS</span>
          </div>
          <button type="button" onClick={newConversation} className="glass grid size-11 place-items-center rounded-full text-ink-2 transition-colors hover:text-ink" aria-label="שיחה חדשה">
            <Icon name="compose" size={20} />
          </button>
        </div>
      </header>

      <main ref={scroller} className={`scroll relative flex-1 overflow-y-auto overscroll-contain ${empty ? "" : "fade-edges"}`}>
        {empty ? (
          <div className="mx-auto flex min-h-full w-full max-w-[var(--column)] flex-col items-center justify-center pb-6 text-center">
            <div className="relative -mb-6 sm:-mb-4">
              <Orb size={280} state={working ? "thinking" : "idle"} />
            </div>
            <h1 className="display gradient-text px-6 text-[4.6rem] sm:text-[6rem]">{hello || "\u00a0"}</h1>
            <p className="mt-3 px-6 text-[1.1rem] text-ink-2">אני כאן. פשוט תגיד מה צריך.</p>
            <div className="no-scrollbar mt-9 flex w-full snap-x gap-2.5 overflow-x-auto px-5 pb-2 sm:flex-wrap sm:justify-center sm:overflow-visible">
              {IDEAS.map((idea, i) => (
                <button
                  key={idea.title}
                  type="button"
                  onClick={() => {
                    setText(idea.text);
                    window.dispatchEvent(new Event("jarvis:focus-composer"));
                  }}
                  className="idea rise flex shrink-0 snap-start items-center gap-2.5 rounded-full py-2 ps-2 pe-4 text-[0.95rem] text-ink"
                  style={{ animationDelay: `${120 + i * 60}ms` }}
                >
                  <span className="grid size-8 place-items-center rounded-full" style={{ background: `color-mix(in oklab, ${idea.color} 22%, transparent)`, color: idea.color }}>
                    <Icon name={idea.icon} size={17} strokeWidth={1.9} />
                  </span>
                  {idea.title}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-[var(--column)] flex-col gap-8 px-4 pb-10 pt-6 sm:px-6">
            {withSeparators.map(({ m, sep }) => (
              <div key={m.id} className="flex flex-col gap-8">
                {sep && <DaySeparator iso={m.createdAt} />}
                {m.role === "user" ? <UserMessage m={m} /> : <JarvisMessage m={m} fresh={m.id === freshId} />}
              </div>
            ))}
            {live && (
              <div className="flex gap-3" aria-live="polite">
                <Core size={22} state="thinking" className="mt-1" />
                <div className="min-w-0 flex-1">
                  <span key={statusText} className="rise shimmer block text-[1.0625rem]">
                    {statusText}
                  </span>
                  {live.steps.length > 1 && <StepList steps={live.steps} live />}
                  <ActionCards actions={live.actions} />
                  <Chips chips={live.chips} />
                </div>
              </div>
            )}
            {pushHint && <div>{pushHint}</div>}
          </div>
        )}
      </main>

      {!empty && !atBottom && (
        <button
          type="button"
          onClick={() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" })}
          className="glass-strong rise absolute bottom-28 left-1/2 z-20 grid size-10 -translate-x-1/2 place-items-center rounded-full text-ink-2"
          style={{ marginBottom: "var(--safe-bottom)" }}
          aria-label="לסוף השיחה"
        >
          <Icon name="down" size={18} />
        </button>
      )}

      <footer className="relative z-20 shrink-0 pt-1" style={{ paddingBottom: "max(var(--safe-bottom), 14px)" }}>
        <Composer
          value={text}
          onChange={setText}
          onSend={() => void send(text)}
          busy={busy}
          transcribing={transcribing}
          onMic={() => void onMic()}
          onCancelWork={cancelWork}
          notice={notice}
        />
      </footer>

      {listening && <VoiceOverlay level={recorder.level} elapsed={recorder.elapsed} onCancel={() => void onStopRecording(false)} onSend={() => void onStopRecording(true)} />}

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        conversations={conversations}
        activeId={conversationId}
        onSelect={(id) => {
          setDrawerOpen(false);
          void openConversation(id);
        }}
        onNew={newConversation}
        onArchive={(id) => void archive(id)}
        push={{
          state: push.state,
          busy: push.busy,
          subscribe: () =>
            void push.subscribe().then((m) => {
              if (m) setNotice(m);
            }),
        }}
        onLock={() => void lock()}
        lockable={lockable}
      />
    </div>
  );
}
