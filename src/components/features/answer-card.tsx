"use client";
import { useState } from "react";
import { BookmarkPlus, ChevronDown, Info, TriangleAlert } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/client/api";
import { qk, useMemories } from "@/client/queries";
import { toast } from "@/client/store";
import { cn } from "@/lib/utils";
import { Evidence } from "./insight";

export interface StructuredAnswer {
  answer: string;
  points: { type: "fact" | "calculation" | "pattern" | "hypothesis" | "recommendation"; text: string; evidence: string[] }[];
  caveats: string[];
  sufficiency: "sufficient" | "limited" | "insufficient";
  followUps: string[];
  facts: { id: string; text: string; kind: string; tool: string }[];
  evidenceBlocks: { kind: string; label: string; data: Record<string, unknown> }[];
  plan: { tools: string[]; range: { from: string; to: string; label: string }; type: string; domains: string[]; planner: string; tier: string };
  mode: "ai" | "fallback";
  model?: string;
  provider?: string;
  notice?: string;
  proposedMemoryIds: string[];
  dataScope: Record<string, number>;
}

const TYPE: Record<StructuredAnswer["points"][number]["type"], { label: string; cls: string; bar: string }> = {
  fact: { label: "עובדה", cls: "bg-sunken text-ink-2", bar: "bg-line-strong" },
  calculation: { label: "חישוב", cls: "bg-sunken text-ink-2", bar: "bg-line-strong" },
  pattern: { label: "דפוס", cls: "bg-accent-soft text-accent-strong", bar: "bg-accent" },
  hypothesis: { label: "השערה", cls: "bg-info-soft text-info", bar: "bg-info" },
  recommendation: { label: "המלצה", cls: "bg-warning-soft text-warning", bar: "bg-warning" },
};

const DOMAIN: Record<string, string> = {
  sleep: "שינה",
  exercise: "אימונים",
  mood: "מצב רוח",
  energy: "אנרגיה",
  focus: "ריכוז",
  habits: "הרגלים",
  goals: "מטרות",
  spending: "הוצאות",
  work: "עבודה",
  journal: "יומן",
  steps: "צעדים",
  weight: "משקל",
  learning: "למידה",
  memory: "זיכרון",
};

const SCOPE: Record<string, string> = {
  habits: "הרגלים",
  goals: "מטרות",
  checkins: "צ׳ק־אינים",
  checkinNotes: "הערות צ׳ק־אין",
  journalEntries: "רשומות יומן",
  memories: "זיכרונות",
  insights: "תובנות",
  transactions: "עסקאות",
  calendarEvents: "אירועי יומן",
  weeks: "שבועות",
  days: "ימים",
};

export function AnswerCard({ a, onFollowUp }: { a: StructuredAnswer; onFollowUp: (q: string) => void }) {
  const [open, setOpen] = useState(false);
  const cited = new Set(a.points.flatMap((p) => p.evidence));
  const citedFacts = a.facts.filter((f) => cited.has(f.id));
  return (
    <div className="space-y-3">
      <p className="selectable text-[16px] leading-relaxed">{a.answer}</p>

      {a.sufficiency === "insufficient" ? (
        <div className="flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2 text-[13px] text-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" /> אין מספיק נתונים כדי לענות על זה בביטחון.
        </div>
      ) : null}

      {a.points.length ? (
        <ul className="space-y-2.5">
          {a.points.map((p, i) => (
            <li key={i} className="flex gap-3">
              <span className={cn("mt-1 w-0.5 shrink-0 self-stretch rounded-full", TYPE[p.type].bar)} aria-hidden />
              <div className="min-w-0">
                <span className={cn("me-2 inline-block rounded-md px-1.5 py-px text-[11px] font-medium", TYPE[p.type].cls)}>{TYPE[p.type].label}</span>
                <span className="selectable text-[15px] leading-relaxed">{p.text}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {a.caveats.length ? (
        <div className="space-y-1 text-[13px] leading-relaxed text-muted">
          {a.caveats.map((c, i) => (
            <p key={i} className="flex gap-1.5">
              <Info className="mt-0.5 size-3.5 shrink-0" /> {c}
            </p>
          ))}
        </div>
      ) : null}

      <MemoryProposals ids={a.proposedMemoryIds} />

      <div className="rounded-xl ring-1 ring-line">
        <button onClick={() => setOpen((x) => !x)} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-[13px] font-medium text-ink-2" aria-expanded={open}>
          <span>הצג ראיות ואיך הגעתי לזה</span>
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </button>
        {open ? (
          <div className="space-y-5 border-t border-line px-3 pb-4 pt-3">
            <div className="space-y-1 text-[13px] text-muted">
              <p>
                <span className="font-medium text-ink-2">נותח:</span> {a.plan.domains.map((d) => DOMAIN[d] ?? d).join(", ") || "תמונה כללית"} · {a.plan.range.label}
              </p>
              <p>
                <span className="font-medium text-ink-2">מה נשלח ל־AI:</span>{" "}
                {a.mode === "ai" ? (
                  <>
                    {a.facts.length} עובדות מחושבות
                    {Object.entries(a.dataScope)
                      .filter(([k, v]) => SCOPE[k] && v > 0)
                      .map(([k, v]) => `, ${v} ${SCOPE[k]}`)
                      .join("")}{" "}
                    — לא טבלאות גולמיות.
                  </>
                ) : (
                  "כלום — התשובה חושבה ישירות מהנתונים, בלי AI."
                )}
              </p>
              {a.model ? (
                <p className="ltr text-start">
                  {a.provider} · {a.model} · {a.plan.tier}
                </p>
              ) : null}
            </div>
            {citedFacts.length ? (
              <div>
                <h4 className="mb-2 text-[13px] font-semibold text-muted">העובדות שצוטטו</h4>
                <ul className="space-y-1.5 text-[13px] leading-relaxed text-ink-2">
                  {citedFacts.map((f) => (
                    <li key={f.id} className="flex gap-2">
                      <span className="ltr num shrink-0 text-faint">{f.id}</span>
                      <span>{f.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {a.evidenceBlocks.length ? <Evidence blocks={a.evidenceBlocks.slice(0, 6)} /> : null}
          </div>
        ) : null}
      </div>

      {a.notice ? <p className="text-[12px] text-faint">{a.notice}</p> : null}

      {a.followUps.length ? (
        <div className="flex flex-wrap gap-2 pt-1">
          {a.followUps.map((q) => (
            <button key={q} onClick={() => onFollowUp(q)} className="rounded-full bg-surface-2 px-3 py-1.5 text-start text-[13px] text-ink-2 ring-1 ring-line hover:bg-sunken">
              {q}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MemoryProposals({ ids }: { ids: string[] }) {
  const { data } = useMemories();
  const qc = useQueryClient();
  const items = (data ?? []).filter((m) => ids.includes(m.id) && m.status === "proposed");
  if (!items.length) return null;
  const act = async (id: string, status: "active" | "rejected") => {
    await api.patch(`/api/memories/${id}`, { status });
    toast(status === "active" ? "נשמר בזיכרון" : "לא יישמר", { tone: status === "active" ? "success" : "default" });
    void qc.invalidateQueries({ queryKey: qk.memories });
  };
  return (
    <div className="space-y-2 rounded-xl bg-accent-soft/60 p-3">
      <div className="flex items-center gap-1.5 text-[13px] font-semibold text-accent-strong">
        <BookmarkPlus className="size-4" /> לשמור בזיכרון ארוך הטווח?
      </div>
      {items.map((m) => (
        <div key={m.id} className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[14px]">{m.content}</span>
          <div className="flex gap-1.5">
            <button onClick={() => act(m.id, "active")} className="rounded-lg bg-accent px-3 py-1 text-[13px] font-medium text-accent-ink">
              שמור
            </button>
            <button onClick={() => act(m.id, "rejected")} className="rounded-lg px-3 py-1 text-[13px] text-muted hover:bg-surface">
              לא
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
