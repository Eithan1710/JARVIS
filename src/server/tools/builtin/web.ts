import "server-only";
import { z } from "zod";
import { connectionSecret } from "../../connections/registry";
import { clip } from "../../services/text";
import { defineTool } from "../types";

const UA = "JARVIS-personal-assistant/1.0";

async function getJson<T>(url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}, timeoutMs = 12_000): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "user-agent": UA, accept: "application/json", ...(init.headers ?? {}) }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`http ${res.status}`);
  return (await res.json()) as T;
}

async function wikipedia(query: string, lang: "he" | "en") {
  const data = await getJson<{ query?: { search?: { title: string; snippet: string }[] } }>(
    `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=4&origin=*&srsearch=${encodeURIComponent(query)}`,
  );
  const hits = data.query?.search ?? [];
  const out = [];
  for (const h of hits.slice(0, 3)) {
    try {
      const s = await getJson<{ extract?: string; content_urls?: { desktop?: { page?: string } } }>(
        `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(h.title.replace(/ /g, "_"))}`,
      );
      out.push({ title: h.title, url: s.content_urls?.desktop?.page ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(h.title)}`, content: clip(s.extract ?? "", 900) });
    } catch {
      out.push({ title: h.title, url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(h.title)}`, content: clip(h.snippet.replace(/<[^>]+>/g, ""), 300) });
    }
  }
  return out;
}

export const searchWebTool = defineTool({
  name: "search_web",
  description:
    "Search the web for current or factual information you don't reliably know (news, prices, recent events, facts to verify). Returns titles, URLs and snippets — cite sources in your reply as markdown links.",
  signature: "{ query: string, lang?: 'he'|'en' }",
  params: z.object({ query: z.string().min(2).max(300), lang: z.enum(["he", "en"]).optional() }),
  status: (a) => `מחפש ברשת: ${clip(a.query, 40)}`,
  icon: "globe",
  async run(a, t) {
    const key = await connectionSecret(t.ctx, "web_search");
    if (key) {
      try {
        const data = await getJson<{ answer?: string; results?: { title: string; url: string; content: string }[] }>(
          "https://api.tavily.com/search",
          {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
            body: JSON.stringify({ query: a.query, max_results: 6, include_answer: true, search_depth: "basic" }),
          },
          20_000,
        );
        return { ok: true, data: { source: "web", answer: data.answer ?? null, results: (data.results ?? []).map((r) => ({ title: r.title, url: r.url, content: clip(r.content, 700) })) } };
      } catch {
        /* fall back to Wikipedia */
      }
    }
    const lang = a.lang ?? (/[֐-׿]/.test(a.query) ? "he" : "en");
    const results = await wikipedia(a.query, lang).catch(() => []);
    const extra = results.length < 2 ? await wikipedia(a.query, lang === "he" ? "en" : "he").catch(() => []) : [];
    const all = [...results, ...extra];
    if (!all.length) return { ok: false, error: "no results (only Wikipedia search is available — no web search key configured)" };
    return { ok: true, data: { source: "wikipedia (general web search not configured)", results: all } };
  },
});

/* ─────────────────────────── read a web page ─────────────────────────── */

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|\[?::1\]?|\[?f[cd][0-9a-f]{2}:.*)$/i;

export function isFetchableUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (PRIVATE_HOST.test(u.hostname) || u.username || u.password) return null;
    return u;
  } catch {
    return null;
  }
}

export function htmlToText(html: string): { title: string | null; text: string } {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? null;
  const body = html
    .replace(/<(head|script|style|noscript|svg|nav|footer|header|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  return { title, text: body };
}

export const fetchUrlTool = defineTool({
  name: "fetch_url",
  description: "Read the text content of a public web page (an article, docs, a link the user shared).",
  signature: "{ url: string }",
  params: z.object({ url: z.string().min(8).max(2000) }),
  status: (a) => `קורא את ${(() => { try { return new URL(a.url).hostname.replace(/^www\./, ""); } catch { return "הדף"; } })()}…`,
  icon: "globe",
  async run(a) {
    const u = isFetchableUrl(a.url);
    if (!u) return { ok: false, error: "url not allowed (must be a public http(s) address)" };
    // Follow redirects manually so every hop is re-checked against private addresses.
    let target: URL | null = u;
    let res: Response | null = null;
    for (let hop = 0; hop < 4 && target; hop++) {
      res = await fetch(target, { headers: { "user-agent": UA, accept: "text/html,text/plain;q=0.9,*/*;q=0.5" }, redirect: "manual", signal: AbortSignal.timeout(15_000) });
      if (res.status < 300 || res.status >= 400) break;
      const loc: string | null = res.headers.get("location");
      target = loc ? isFetchableUrl(new URL(loc, target).toString()) : null;
      if (!target) return { ok: false, error: "redirect to a disallowed address" };
    }
    if (!res || !res.ok) return { ok: false, error: `http ${res?.status ?? "error"}` };
    const type = res.headers.get("content-type") ?? "";
    if (!/text|json|xml/.test(type)) return { ok: false, error: `unsupported content type ${type}` };
    const raw = (await res.text()).slice(0, 1_500_000);
    const { title, text } = /html/.test(type) ? htmlToText(raw) : { title: null, text: raw };
    return { ok: true, data: { url: res.url, title, text: text.slice(0, 14_000), truncated: text.length > 14_000 } };
  },
});

export const readGithubTool = defineTool({
  name: "read_github",
  description:
    "Read GitHub: pass `repo` ('owner/name' or URL) for metadata, README and file tree, plus `path` to read a specific file; or pass `user` for their profile, recent repos and recent public activity ('what have I been working on'). Hand large analyses to a worker with this data as context.",
  signature: "{ repo?: string, path?: string, user?: string }",
  params: z.object({ repo: z.string().max(200).optional(), path: z.string().max(400).optional(), user: z.string().max(80).optional() }),
  status: (a) => (a.user ? "בודק את GitHub…" : `קורא את ${a.repo ?? "המאגר"} ב־GitHub…`),
  icon: "github",
  async run(a, t) {
    const token = await connectionSecret(t.ctx, "github");
    const headers: Record<string, string> = { "x-github-api-version": "2022-11-28", ...(token ? { authorization: `Bearer ${token}` } : {}) };
    const gh = <T>(p: string, accept = "application/vnd.github+json") => getJson<T>(`https://api.github.com${p}`, { headers: { ...headers, accept } });
    const ghText = async (p: string) => {
      const res = await fetch(`https://api.github.com${p}`, { headers: { ...headers, accept: "application/vnd.github.raw", "user-agent": UA }, signal: AbortSignal.timeout(12_000) });
      if (!res.ok) throw new Error(`http ${res.status}`);
      return res.text();
    };
    try {
      if (a.user && !a.repo) {
        const u = encodeURIComponent(a.user);
        const [profile, repos, events] = await Promise.all([
          gh<{ login: string; name?: string; bio?: string; public_repos?: number }>(`/users/${u}`),
          gh<{ full_name: string; description?: string; language?: string; pushed_at: string; stargazers_count: number }[]>(`/users/${u}/repos?sort=pushed&per_page=10`),
          gh<{ type: string; repo: { name: string }; created_at: string; payload?: { commits?: { message: string }[] } }[]>(`/users/${u}/events/public?per_page=40`).catch(() => []),
        ]);
        return {
          ok: true,
          data: {
            profile: { login: profile.login, name: profile.name, bio: profile.bio, public_repos: profile.public_repos },
            recent_repos: repos.map((r) => ({ repo: r.full_name, description: r.description, language: r.language, last_push: r.pushed_at.slice(0, 10), stars: r.stargazers_count })),
            recent_activity: events.slice(0, 30).map((e) => ({ type: e.type, repo: e.repo.name, at: e.created_at.slice(0, 16), commits: e.payload?.commits?.slice(0, 3).map((c) => clip(c.message, 100)) })),
          },
        };
      }
      const repo = (a.repo ?? "").replace(/^https?:\/\/(www\.)?github\.com\//, "").replace(/\.git$/, "").split("/").slice(0, 2).join("/");
      if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { ok: false, error: "pass repo as 'owner/name' or user" };
      if (a.path) {
        const text = await ghText(`/repos/${repo}/contents/${a.path.split("/").map(encodeURIComponent).join("/")}`);
        return { ok: true, data: { repo, path: a.path, content: text.slice(0, 20_000), truncated: text.length > 20_000 } };
      }
      const meta = await gh<{ full_name: string; description?: string; default_branch: string; language?: string; stargazers_count: number; open_issues_count: number; pushed_at: string; topics?: string[] }>(`/repos/${repo}`);
      const [readme, tree, languages] = await Promise.all([
        ghText(`/repos/${repo}/readme`).catch(() => ""),
        gh<{ tree: { path: string; type: string; size?: number }[]; truncated: boolean }>(`/repos/${repo}/git/trees/${encodeURIComponent(meta.default_branch)}?recursive=1`).catch(() => ({ tree: [], truncated: false })),
        gh<Record<string, number>>(`/repos/${repo}/languages`).catch(() => ({})),
      ]);
      const files = tree.tree.filter((f) => f.type === "blob").map((f) => f.path);
      return {
        ok: true,
        data: {
          repo: meta.full_name,
          description: meta.description,
          default_branch: meta.default_branch,
          languages,
          stars: meta.stargazers_count,
          open_issues: meta.open_issues_count,
          last_push: meta.pushed_at,
          topics: meta.topics,
          file_count: files.length,
          files: files.slice(0, 300),
          readme: readme.slice(0, 8_000),
        },
      };
    } catch (e) {
      return { ok: false, error: `GitHub request failed (${e instanceof Error ? e.message : "error"}) — private repos need a GitHub token` };
    }
  },
});
