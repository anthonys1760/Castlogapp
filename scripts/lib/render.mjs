import { marked } from "marked";

marked.setOptions({
  gfm: true,
  breaks: false,
  headerIds: false,
  mangle: false,
});

export function renderMarkdown(md) {
  return marked.parse(md);
}

export function countWords(md) {
  const text = md.replace(/```[\s\S]*?```/g, " ").replace(/[#>*_`~\-\[\]\(\)!]/g, " ");
  return text.split(/\s+/).filter(Boolean).length;
}

export function readingTime(words) {
  return Math.max(1, Math.ceil(words / 220));
}

export function countH2s(md) {
  return (md.match(/^##\s+/gm) || []).length;
}

export function formatDateHuman(isoDate) {
  const d = new Date(isoDate + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

export function formatDateRFC822(isoDate) {
  const d = new Date(isoDate + "T09:00:00Z");
  return d.toUTCString();
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function renderTemplate(template, tokens) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(tokens, key)) {
      const v = tokens[key];
      return v == null ? "" : String(v);
    }
    return match;
  });
}

const RELATED_STOP = new Set([
  "the", "and", "for", "you", "your", "with", "from", "that", "this",
  "app", "fishing", "fish", "log", "journal", "catch", "catches", "best",
]);

function tokensFor(post) {
  const blob = [...(post.keywords || []), post.title || "", post.slug || "", post.description || ""]
    .join(" ")
    .toLowerCase();
  return new Set(
    blob.split(/[^a-z0-9]+/).filter(w => w.length > 2 && !RELATED_STOP.has(w))
  );
}

function seasonTags(post) {
  const blob = [...(post.keywords || []), post.title || "", post.slug || ""]
    .join(" ")
    .toLowerCase();
  const tags = new Set();
  if (/spring|prespawn|pre-spawn|march|april/.test(blob)) tags.add("spring");
  if (/summer|june|july|august/.test(blob)) tags.add("summer");
  if (/fall|autumn|turnover|november|october|september|steelhead/.test(blob)) tags.add("fall");
  if (/winter|ice|december|january|february/.test(blob)) tags.add("winter");
  return tags;
}

function relatedScore(current, candidate) {
  const a = tokensFor(current);
  const b = tokensFor(candidate);
  let overlap = 0;
  for (const t of a) if (b.has(t)) overlap += 1;
  const sa = seasonTags(current);
  const sb = seasonTags(candidate);
  let season = 0;
  for (const t of sa) if (sb.has(t)) season += 1;
  return overlap * 10 + season * 20;
}

export function pickRelated(allPosts, currentSlug, count = 3) {
  const current = allPosts.find(p => p.slug === currentSlug);
  const others = allPosts.filter(p => p.slug !== currentSlug);
  return others
    .map(post => ({
      post,
      score: current ? relatedScore(current, post) : 0,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.post.date > a.post.date ? 1 : b.post.date < a.post.date ? -1 : 0;
    })
    .slice(0, count)
    .map(entry => entry.post);
}

export function buildRelatedBlock(related) {
  if (related.length < 2) return "";
  const links = related
    .slice(0, 3)
    .map(p => `  <a href="/blog/${p.slug}/">${escapeHtml(p.title)}</a>`)
    .join("\n");
  return `<aside class="related">
  <div class="related-label">Related posts</div>
${links}
  <a href="/blog/" class="related-index">All field notes →</a>
</aside>`;
}
