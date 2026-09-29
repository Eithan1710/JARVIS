import { z } from "zod";
import { route, zDate } from "@/server/api/handler";
import { createJournal, journalInput, listJournal } from "@/server/services/journal";

export const GET = route({ query: z.object({ from: zDate.optional(), to: zDate.optional(), q: z.string().max(100).optional(), limit: z.coerce.number().int().min(1).max(200).optional() }) }, (ctx, { query }) => listJournal(ctx, query));
export const POST = route({ body: journalInput }, (ctx, { body }) => createJournal(ctx, body));
