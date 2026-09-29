import { NextResponse } from "next/server";
import { route } from "@/server/api/handler";
import { exportAll } from "@/server/services/system";

export const GET = route({}, async (ctx) => {
  const data = await exportAll(ctx);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="nova-export-${ctx.today}.json"`,
      "cache-control": "no-store",
    },
  });
});
