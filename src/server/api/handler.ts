import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError, type ZodType } from "zod";
import { getUserContext, UnauthorizedError, type UserContext } from "../context";
import { errorInfo, logger } from "../logger";

const log = logger("api");

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    /** User-facing Hebrew message. */
    public userMessage: string,
  ) {
    super(code);
  }
}

export const notFound = (what = "הפריט") => new ApiError(404, "not_found", `${what} לא נמצא`);
export const badRequest = (msg: string) => new ApiError(400, "bad_request", msg);

type Params = Record<string, string>;

interface HandlerArgs<B, Q> {
  req: NextRequest;
  body: B;
  query: Q;
  params: Params;
}

interface Options<B, Q> {
  body?: ZodType<B>;
  query?: ZodType<Q>;
  /** Skip session auth (endpoint does its own, e.g. cron secret or ingest token). */
  public?: boolean;
}

export function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Route handler wrapper: auth → validation → handler → uniform JSON envelope.
 * Response: { data } on success, { error: { code, message } } on failure.
 */
export function route<B = undefined, Q = undefined, R = unknown>(
  opts: Options<B, Q>,
  fn: (ctx: UserContext, args: HandlerArgs<B, Q>) => Promise<R>,
) {
  return async (req: NextRequest, segment: { params: Promise<Params> }) => {
    const started = Date.now();
    try {
      const ctx = opts.public ? (null as unknown as UserContext) : await getUserContext();
      const params = (await segment?.params) ?? {};
      let body = undefined as B;
      if (opts.body) {
        let raw: unknown = {};
        try {
          raw = await req.json();
        } catch {
          raw = {};
        }
        body = opts.body.parse(raw);
      }
      let query = undefined as Q;
      if (opts.query) {
        query = opts.query.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
      }
      const data = await fn(ctx, { req, body, query, params });
      if (data instanceof Response) return data;
      return NextResponse.json({ data: data ?? null }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (err) {
      if (err instanceof UnauthorizedError) return jsonError(401, "unauthorized", "נדרשת כניסה מחדש");
      if (err instanceof ApiError) return jsonError(err.status, err.code, err.userMessage);
      if (err instanceof ZodError) {
        log.warn("validation failed", { path: req.nextUrl.pathname, issues: err.issues.length });
        return jsonError(400, "validation", "חלק מהפרטים שנשלחו אינם תקינים");
      }
      log.error("unhandled", { path: req.nextUrl.pathname, ms: Date.now() - started, ...errorInfo(err) });
      return jsonError(500, "internal", "משהו השתבש. נסה שוב בעוד רגע.");
    }
  };
}

/* Common validators */
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const zUuid = z.string().uuid();
export const zRange = z.object({ from: zDate.optional(), to: zDate.optional() });
