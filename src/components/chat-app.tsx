"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, Chip, ClientAction, ConversationSummary, Step, StreamEvent } from "@/lib/protocol";
import { ApiError, apiGet, apiSend, apiUpload } from "@/client/api";
import { registerServiceWorker, usePush } from "@/client/push";
import { speak, stopSpeaking } from "@/client/speech";
import { streamChat } from "@/client/stream";
import { useRecorder } from "@/client/voice";
import { Composer } from "./composer";
import { Core } from "./core";
import { Drawer } from "./drawer";
import { Icon } from "./icons";
import { ActionButtons, Chips, DaySeparator, JarvisMessage, UserMessage } from "./message-view";

const LAST_KEY = "jarvis.conversation";
/** After this long without activity, JARVIS opens on a fresh screen (the old thread stays in history). */
const FRESH_AFTER_MS = 6 * 60 * 60 * 1000;

function greeting(name: string) {
  const h = new Date().getHours();
  const part = h >= 5 && h < 12 ? "בוקר טוב" : h >= 12 && h < 17 ? "צהריים טובים" : h >= 17 && h < 22 ? "ערב טוב" : "לילה טוב";
  return name ? `${part}, ${name}.` : `${part}.`;
}

const SUGGESTIONS = ["תזכיר לי היום ב־20:00 להתקשר לאמא", "אני רוצה לבנות הרגל של קריאה כל ערב", "תפתח לי ניווט הביתה"];

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
  const [name, setName] = useState("");
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
    void apiGet<{ name: string }>("/api/system")
      .then((s) => setName(s.name ?? ""))
      .catch(() => {});
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

  const coreState = recorder.state === "recording" ? "listening" : busy || transcribing ? "thinking" : "idle";
  const empty = loaded && messages.length === 0 && !busy;
  const runningStep = live?.steps.filter((s) => s.state === "running").at(-1);
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
        className="mt-3 inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-[0.9rem] text-pearl-2 hover:bg-veil"
      >
        <Icon name="bell" size={16} className="text-ember" />
        כדי שהתזכורות יגיעו גם כשהאפליקציה סגורה — הפעל התראות
      </button>
    ) : showPushHint && push.state === "ios-needs-install" ? (
      <p className="mt-3 text-[0.88rem] text-mist">כדי לקבל תזכורות באייפון: שתף ← ״הוסף למסך הבית״, ואז פתח את JARVIS משם.</p>
    ) : null;

  return (
    <div className="relative z-10 flex h-[100dvh] flex-col">
      <header className="relative z-20 shrink-0" style={{ paddingTop: "var(--safe-top)" }}>
        <div className="mx-auto flex h-14 w-full max-w-[var(--column)] items-center justify-between px-2 sm:px-3">
          <button type="button" onClick={openDrawer} className="grid size-11 place-items-center rounded-full text-pearl-2 transition-colors hover:bg-veil hover:text-pearl" aria-label="שיחות">
            <Icon name="menu" size={22} />
          </button>
          <div className={`flex items-center gap-2.5 transition-opacity duration-500 ${empty ? "opacity-0" : "opacity-100"}`} dir="ltr">
            <Core size={22} state={coreState} level={recorder.level} />
            <span className="font-[family-name:var(--font-mark)] text-[0.82rem] tracking-[0.34em] text-pearl-2">JARVIS</span>
          </div>
          <button type="button" onClick={newConversation} className="grid size-11 place-items-center rounded-full text-pearl-2 transition-colors hover:bg-veil hover:text-pearl" aria-label="שיחה חדשה">
            <Icon name="plus" size={22} />
          </button>
        </div>
      </header>

      <main ref={scroller} className="scroll relative flex-1 overflow-y-auto overscroll-contain">
        {empty ? (
          <div className="mx-auto flex min-h-full w-full max-w-[var(--column)] flex-col items-center justify-center px-6 pb-10 text-center">
            <Core size={148} state={coreState} level={recorder.level} className="mb-10" />
            <h1 className="font-serif text-[2.1rem] leading-tight text-pearl sm:text-[2.6rem]">{greeting(name)}</h1>
            <p className="mt-3 text-[1.05rem] text-mist">על מה נעבוד?</p>
            <div className="mt-9 flex w-full max-w-sm flex-col items-center gap-2.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setText(s);
                    window.dispatchEvent(new Event("jarvis:focus-composer"));
                  }}
                  className="rounded-full border border-line px-4 py-2 text-[0.93rem] text-pearl-2 transition-colors hover:border-[var(--line-strong)] hover:bg-veil hover:text-pearl"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-[var(--column)] flex-col gap-7 px-5 pb-8 pt-4 sm:px-6">
            {withSeparators.map(({ m, sep }) => (
              <div key={m.id}>
                {sep && <DaySeparator iso={m.createdAt} />}
                {m.role === "user" ? <UserMessage m={m} /> : <JarvisMessage m={m} fresh={m.id === freshId} />}
              </div>
            ))}
            {live && (
              <div className="flex flex-col" aria-live="polite">
                <div className="flex items-center gap-3">
                  <Core size={26} state="thinking" />
                  <span key={statusText} className="status-line shimmer text-[0.98rem]">
                    {statusText}
                  </span>
                </div>
                <ActionButtons actions={live.actions} />
                <Chips chips={live.chips} />
              </div>
            )}
            {pushHint && <div>{pushHint}</div>}
          </div>
        )}
      </main>

      <footer className="relative z-20 shrink-0 pt-2" style={{ paddingBottom: "max(var(--safe-bottom), 12px)" }}>
        <Composer
          value={text}
          onChange={setText}
          onSend={() => void send(text)}
          busy={busy}
          recording={recorder.state === "recording"}
          transcribing={transcribing}
          level={recorder.level}
          elapsed={recorder.elapsed}
          onMic={() => void onMic()}
          onStopRecording={(s) => void onStopRecording(s)}
          onCancelWork={cancelWork}
          notice={notice}
        />
      </footer>

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
