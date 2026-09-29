import { route } from "@/server/api/handler";
import { deleteJournal, journalPatch, updateJournal } from "@/server/services/journal";

export const PATCH = route({ body: journalPatch }, (ctx, { params, body }) => updateJournal(ctx, params.id, body));
export const DELETE = route({}, async (ctx, { params }) => {
  await deleteJournal(ctx, params.id);
  return { ok: true };
});
