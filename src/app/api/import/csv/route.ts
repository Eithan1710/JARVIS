import { z } from "zod";
import { route, badRequest } from "@/server/api/handler";
import { csvToRecords } from "@/server/integrations/providers/csv";
import { ingestRecords } from "@/server/integrations/service";

export const maxDuration = 60;
export const POST = route({ body: z.object({ kind: z.enum(["metrics", "transactions"]), csv: z.string().min(1).max(3_000_000), dryRun: z.boolean().optional() }) }, async (ctx, { body }) => {
  const { records, errors } = csvToRecords(body.kind, body.csv);
  if (!records.length) throw badRequest(errors[0] ?? "לא נמצאו שורות תקינות בקובץ");
  if (body.dryRun) return { preview: records.slice(0, 8).map((r) => r.outputs[0]), total: records.length, errors };
  const res = await ingestRecords(ctx, `csv_${body.kind}`, null, records);
  return { ...res, errors };
});
