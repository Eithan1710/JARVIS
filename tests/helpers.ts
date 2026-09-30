import type { AIProvider, AIRequest, AIResponse, ModelSize } from "@/server/ai/types";

/** A scripted provider: Leader calls pop from `leader`, everything else answers sensibly. */
export class FakeProvider implements AIProvider {
  id = "fake";
  label = "Fake";
  leader: string[] = [];
  calls: { system: string; last: string }[] = [];
  available() {
    return true;
  }
  model(size: ModelSize) {
    return `fake-${size}`;
  }
  async generate(req: AIRequest & { model: string }): Promise<AIResponse> {
    const last = req.messages.at(-1)?.content ?? "";
    this.calls.push({ system: req.system, last });
    let text: string;
    if (req.system.startsWith("You are JARVIS")) text = this.leader.shift() ?? JSON.stringify({ actions: [], reply: "בסדר.", final: true });
    else if (req.system.includes("long-term memory")) text = JSON.stringify({ add: [{ content: "עובד בפיתוח backend", kind: "fact", importance: 3 }], update: [], forget: [] });
    else if (req.system.includes("title for this conversation")) text = "שיחה לדוגמה";
    else text = `WORKER OUTPUT for: ${last.slice(0, 40)}`;
    return { text, provider: this.id, model: req.model };
  }
}

export function leaderJson(o: { actions?: unknown[]; reply?: string | null; final?: boolean }) {
  return JSON.stringify({ actions: o.actions ?? [], reply: o.reply ?? null, final: o.final ?? !o.actions?.length });
}
