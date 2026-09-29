import { z } from "zod";
import { addDays, zonedTime } from "@/lib/dates";
import { route, zDate } from "@/server/api/handler";
import { addCalendarEvent, calendarInput, listCalendar } from "@/server/services/data";

export const GET = route({ query: z.object({ from: zDate.optional(), to: zDate.optional() }) }, (ctx, { query }) => {
  const from = query.from ?? ctx.today;
  const to = query.to ?? addDays(from, 7);
  return listCalendar(ctx, zonedTime(from, "00:00", ctx.timezone), zonedTime(addDays(to, 1), "00:00", ctx.timezone));
});
export const POST = route({ body: calendarInput }, (ctx, { body }) => addCalendarEvent(ctx, body));
