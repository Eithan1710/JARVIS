"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Check, Loader2, MessageSquarePlus, PanelRight, Trash2 } from "lucide-react";
import { qk, useConversation, useConversations, type Message } from "@/client/queries";
import { api } from "@/client/api";
import { useOnline } from "@/client/hooks";
import { toast } from "@/client/store";
import { cn } from "@/lib/utils";
import { Sheet } from "@/components/ui/sheet";
import { Logo } from "@/components/layout/logo";
import { AnswerCard, type StructuredAnswer } from "@/components/features/answer-card";

const SUGGESTIONS = [
  "מתי אני הכי מרוכז?",
  "למה אני פחות עקבי עם אימונים לאחרונה?",
  "מה השתנה בשלושת החודשים האחרונים?",
  "כמה הוצאתי על מסעדות בחודש שעבר?",
  "אילו הרגלים הכי קשורים לפרודוקטיביות שלי?",
  "מה היה שונה בשבועות הטובים שלי?",
  "מה כדאי לי לבדוק לעומק?",
];

type Step = { id: string; label: string; status: "active" | "done" };
type LocalMsg = { id: string; role: "user" | "assistant"; content: string; structured?: StructuredAnswer | null; pending?: boolean };

export default function AskPage() {
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const online = useOnline();
  const [convId, setConvId] = useState<string | null>(params.get("c"));
  const { data: convo } = useConversation(convId);
  const [local, setLocal] = useState<LocalMsg[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const autoAsked = useRef(false);

  const serverMsgs: LocalMsg[] = (convo?.messages ?? []).map((m: Message) => ({ id: m.id, role: m.role, content: m.content, structured: (m.structured as unknown as StructuredAnswer) ?? null }));
  // Local optimistic messages are dropped once the server copy (same id, or same user text) arrives.
  const messages = [...serverMsgs, ...local.filter((l) => !serverMsgs.some((s) => s.id === l.id || (l.role === "user" && s.role === "user" && s.content === l.content)))];

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }));
  }, []);
  useEffect(scrollToEnd, [messages.length, steps.length, scrollToEnd]);

  const send = useCallback(
    async (q: string) => {
      const question = q.trim();
      if (!question || busy) return;
      if (!navigator.onLine) {
        toast("צריך חיבור לאינטרנט כדי לשאול את NOVA", { tone: "offline" });
        return;
      }
      setInput("");
      setBusy(true);
      setSteps([]);
      const tempId = `local-${Date.now()}`;
      setLocal((l) => [...l, { id: tempId, role: "user", content: question }]);
      try {
        const res = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question, conversationId: convId }) });
        if (res.status === 401) {
          location.href = "/unlock?next=/ask";
          return;
        }
        if (!res.ok || !res.body) throw new Error("request failed");
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            const ev = JSON.parse(line);
            if (ev.type === "step") {
              setSteps((s) => {
                const i = s.findIndex((x) => x.id === ev.id);
                if (i >= 0) return s.map((x) => (x.id === ev.id ? ev : x));
                return [...s, ev];
              });
            } else if (ev.type === "result") {
              const m = ev.message as Message;
              setLocal((l) => [...l, { id: m.id, role: "assistant", content: m.content, structured: m.structured as unknown as StructuredAnswer }]);
              if (!convId) {
                setConvId(ev.conversationId);
                router.replace(`/ask?c=${ev.conversationId}`, { scroll: false });
              }
              void qc.invalidateQueries({ queryKey: qk.conversations });
              void qc.invalidateQueries({ queryKey: qk.memories });
            } else if (ev.type === "error") {
              toast(ev.message, { tone: "error" });
            }
          }
        }
      } catch {
        toast("לא הצלחנו לקבל תשובה. נסה שוב.", { tone: "error" });
        setLocal((l) => l.filter((m) => m.id !== tempId));
        setInput(question);
      } finally {
        setBusy(false);
        setSteps([]);
      }
    },
    [busy, convId, qc, router],
  );

  // Deep link: /ask?q=…
  useEffect(() => {
    const q = params.get("q");
    if (q && !autoAsked.current) {
      autoAsked.current = true;
      void send(q);
    }
  }, [params, send]);

  const newChat = () => {
    setConvId(null);
    setLocal([]);
    router.replace("/ask", { scroll: false });
    setListOpen(false);
    textarea.current?.focus();
  };

  const openConversation = (id: string) => {
    setConvId(id);
    setLocal([]);
    router.replace(`/ask?c=${id}`, { scroll: false });
    setListOpen(false);
  };

  const autosize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  return (
    <div className="flex h-[calc(100dvh-52px-var(--safe-top)-max(var(--kb),calc(var(--nav-h)+var(--safe-bottom))))] md:h-[calc(100dvh-64px)]">
      {/* Conversation list (desktop) */}
      <aside className="hidden w-72 shrink-0 flex-col border-e border-line bg-surface-2/60 lg:flex">
        <ConversationList activeId={convId} onOpen={openConversation} onNew={newChat} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-line px-3 lg:hidden">
          <button onClick={() => setListOpen(true)} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-ink-2 hover:bg-sunken">
            <PanelRight className="size-4" /> שיחות
          </button>
          <span className="min-w-0 truncate text-sm text-muted">{convo?.conversation.title ?? ""}</span>
          <button onClick={newChat} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-accent hover:bg-sunken">
            <MessageSquarePlus className="size-4" /> חדשה
          </button>
        </div>

        <div ref={scroller} className="scroll-area min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto w-full max-w-3xl px-4 py-5 md:px-6">
            {!messages.length ? (
              <div className="flex flex-col items-center pt-6 text-center md:pt-14">
                <Logo className="size-12" />
                <h2 className="mt-4 text-xl font-semibold">שאל כל דבר על עצמך</h2>
                <p className="mt-2 max-w-md text-[15px] leading-relaxed text-muted">NOVA מחשבת את התשובה מהנתונים שלך, ושולחת ל־AI רק את מה שרלוונטי לשאלה. כל טענה מגובה בראיות שאפשר לפתוח.</p>
                <div className="mt-6 flex max-w-xl flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="rounded-full bg-surface px-3.5 py-2 text-[14px] text-ink-2 shadow-card hover:bg-surface-2">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((m) =>
                  m.role === "user" ? (
                    <div key={m.id} className="flex justify-end">
                      <div className="selectable max-w-[85%] rounded-[20px] rounded-ee-md bg-accent px-4 py-2.5 text-[15px] leading-relaxed text-accent-ink">{m.content}</div>
                    </div>
                  ) : (
                    <div key={m.id} className="flex gap-3">
                      <Logo className="mt-0.5 size-7 shrink-0" />
                      <div className="min-w-0 flex-1">{m.structured ? <AnswerCard a={m.structured} onFollowUp={send} /> : <p className="text-[16px] leading-relaxed">{m.content}</p>}</div>
                    </div>
                  ),
                )}
                {busy ? (
                  <div className="flex gap-3" aria-live="polite">
                    <Logo className="mt-0.5 size-7 shrink-0" />
                    <ul className="space-y-1.5 pt-1 text-[14px] text-muted">
                      {(steps.length ? steps : [{ id: "0", label: "מתחיל", status: "active" as const }]).map((s) => (
                        <li key={s.id} className="flex items-center gap-2">
                          {s.status === "done" ? <Check className="size-4 text-positive" /> : <Loader2 className="size-4 animate-spin text-accent" />}
                          <span className={s.status === "done" ? "text-faint" : ""}>{s.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="shrink-0 border-t border-line bg-bg/95 px-3 py-2.5 backdrop-blur md:px-6 md:py-4">
          <form
            className="mx-auto flex max-w-3xl items-end gap-2 rounded-[22px] bg-surface p-1.5 shadow-card ring-1 ring-line focus-within:ring-accent/40"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <textarea
              ref={textarea}
              value={input}
              rows={1}
              onChange={(e) => {
                setInput(e.target.value);
                autosize(e.target);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(min-width: 768px)").matches) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              placeholder={online ? "שאל משהו על עצמך…" : "אין חיבור — השאלות דורשות אינטרנט"}
              enterKeyHint="send"
              aria-label="שאלה"
              className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-[16px] leading-relaxed placeholder:text-faint focus:outline-none"
            />
            <button type="submit" disabled={!input.trim() || busy || !online} className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-accent-ink transition-opacity disabled:opacity-30" aria-label="שליחה">
              {busy ? <Loader2 className="size-5 animate-spin" /> : <ArrowUp className="size-5" strokeWidth={2.4} />}
            </button>
          </form>
        </div>
      </div>

      <Sheet open={listOpen} onOpenChange={setListOpen} title="שיחות קודמות" tall>
        <ConversationList activeId={convId} onOpen={openConversation} onNew={newChat} bare />
      </Sheet>
    </div>
  );
}

function ConversationList({ activeId, onOpen, onNew, bare }: { activeId: string | null; onOpen: (id: string) => void; onNew: () => void; bare?: boolean }) {
  const { data } = useConversations();
  const qc = useQueryClient();
  const remove = async (id: string) => {
    if (!confirm("למחוק את השיחה?")) return;
    await api.del(`/api/conversations/${id}`);
    void qc.invalidateQueries({ queryKey: qk.conversations });
    if (id === activeId) onNew();
  };
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", !bare && "p-3")}>
      {!bare ? (
        <button onClick={onNew} className="mb-3 flex h-10 items-center justify-center gap-2 rounded-xl bg-surface text-sm font-medium shadow-card hover:bg-surface-2">
          <MessageSquarePlus className="size-4 text-accent" /> שיחה חדשה
        </button>
      ) : null}
      <ul className="scroll-area min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {(data ?? []).map((c) => (
          <li key={c.id} className="group flex items-center">
            <button onClick={() => onOpen(c.id)} className={cn("min-w-0 flex-1 truncate rounded-lg px-3 py-2.5 text-start text-[14px]", c.id === activeId ? "bg-surface font-medium shadow-card" : "text-ink-2 hover:bg-sunken")}>
              {c.title}
            </button>
            <button onClick={() => remove(c.id)} className="grid size-9 shrink-0 place-items-center rounded-lg text-faint opacity-100 hover:text-negative md:opacity-0 md:group-hover:opacity-100" aria-label="מחיקת שיחה">
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
        {!data?.length ? <li className="px-3 py-6 text-center text-sm text-muted">עוד אין שיחות.</li> : null}
      </ul>
    </div>
  );
}
