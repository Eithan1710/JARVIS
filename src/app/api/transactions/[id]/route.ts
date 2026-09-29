import { route } from "@/server/api/handler";
import { deleteTransaction } from "@/server/services/data";

export const DELETE = route({}, async (ctx, { params }) => {
  await deleteTransaction(ctx, params.id);
  return { ok: true };
});
