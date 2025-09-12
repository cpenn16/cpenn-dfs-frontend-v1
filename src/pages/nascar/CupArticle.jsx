import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

/**
 * NASCAR Cup — Article Page
 * - Renders /data/nascar/cup/latest/article.md
 * - Shows last-updated from /data/nascar/cup/latest/meta.json (if present)
 * - Nice readable prose, mobile-first, dark-mode friendly, table/code styling
 */

const ARTICLE_URL = "/data/nascar/cup/latest/article.md";
const META_URL = "/data/nascar/cup/latest/meta.json";

const Badge = ({ children }) => (
  <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ring-black/10 bg-black/5 dark:bg-white/10">
    {children}
  </span>
);

const Skeleton = () => (
  <div className="animate-pulse space-y-4">
    <div className="h-8 w-1/2 rounded bg-black/10 dark:bg-white/10" />
    <div className="h-4 w-3/4 rounded bg-black/10 dark:bg-white/10" />
    <div className="h-4 w-5/6 rounded bg-black/10 dark:bg-white/10" />
    <div className="h-4 w-2/3 rounded bg-black/10 dark:bg-white/10" />
  </div>
);

export default function CupArticle() {
  const [md, setMd] = useState("");
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    let alive = true;

    async function fetchAll() {
      try {
        const [mdRes, metaRes] = await Promise.allSettled([
          fetch(ARTICLE_URL, { cache: "no-cache" }),
          fetch(META_URL, { cache: "no-cache" }),
        ]);

        if (alive) {
          if (mdRes.status === "fulfilled" && mdRes.value.ok) {
            setMd(await mdRes.value.text());
          } else {
            setMd(`# No article found

Create **${ARTICLE_URL}** to publish your first Cup article.
`);
          }

          if (metaRes.status === "fulfilled" && metaRes.value.ok) {
            setMeta(await metaRes.value.json());
          }
        }
      } catch {
        /* noop */
      } finally {
        if (alive) setLoading(false);
      }
    }

    fetchAll();
    return () => { alive = false; };
  }, []);

  const lastUpdated = useMemo(() => {
    // meta.json your exporter writes can look like:
    // { "files": { "article.md": {"updated_at": "2025-09-12T13:10:33Z"} }, "updated_at": "..." }
    const fileMeta =
      meta?.files?.["article.md"] ??
      meta?.files?.["/data/nascar/cup/latest/article.md"];
    const iso =
      fileMeta?.updated_at ||
      meta?.updated_at ||
      meta?.timestamp ||
      null;

    if (!iso) return null;
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return null;
      return d.toLocaleString();
    } catch {
      return null;
    }
  }, [meta]);

  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-10">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              to="/nascar"
              className="text-sm text-blue-600 hover:underline dark:text-blue-400"
            >
              ← NASCAR
            </Link>
            <h1 className="text-2xl font-bold tracking-tight">Cup Article</h1>
          </div>
          <div className="flex items-center gap-2">
            {lastUpdated && <Badge>Last updated: {lastUpdated}</Badge>}
          </div>
        </div>

        {/* Article Card */}
        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-neutral-900">
          {loading ? (
            <Skeleton />
          ) : (
            <article
              className={[
                "prose max-w-none",
                "prose-headings:scroll-mt-24",
                "prose-headings:font-semibold",
                "prose-p:leading-7",
                "prose-img:rounded-xl",
                "prose-pre:rounded-xl",
                "prose-pre:leading-6",
                "prose-code:before:hidden prose-code:after:hidden",
                "prose-a:text-blue-600 dark:prose-invert prose-headings:mt-8",
              ].join(" ")}
            >
              <ReactMarkdown
                // GitHub tables, strikethrough, checklists, etc.
                remarkPlugins={[remarkGfm]}
                // allow basic inline HTML in your markdown (e.g., <sup>, <sub>, <br/>)
                rehypePlugins={[rehypeRaw]}
                components={{
                  table: (props) => (
                    <div className="my-4 overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
                      <table className="min-w-full divide-y divide-black/10 dark:divide-white/10" {...props} />
                    </div>
                  ),
                  th: (props) => (
                    <th
                      className="bg-black/5 px-3 py-2 text-left text-sm font-semibold dark:bg-white/10"
                      {...props}
                    />
                  ),
                  td: (props) => (
                    <td className="px-3 py-2 text-sm align-top" {...props} />
                  ),
                  pre: (props) => (
                    <pre
                      className="overflow-x-auto rounded-xl bg-neutral-950/95 p-4 text-neutral-100"
                      {...props}
                    />
                  ),
                  code: (props) => (
                    <code className="rounded bg-black/10 px-1 py-0.5 text-[0.9em] dark:bg-white/10" {...props} />
                  ),
                  img: (props) => (
                    <img
                      loading="lazy"
                      className="mx-auto my-4 block max-h-[520px] w-auto"
                      {...props}
                    />
                  ),
                }}
              >
                {md}
              </ReactMarkdown>
            </article>
          )}
        </div>
      </div>
    </div>
  );
}
