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

export function pickRelated(allPosts, currentSlug, count = 2) {
  return allPosts
    .filter(p => p.slug !== currentSlug)
    .sort((a, b) => (b.date > a.date ? 1 : -1))
    .slice(0, count);
}

export function buildRelatedBlock(related) {
  if (related.length < 2) return "";
  const links = related
    .map(p => `  <a href="/blog/${p.slug}/">${escapeHtml(p.title)}</a>`)
    .join("\n");
  return `<aside class="related">
  <div class="related-label">Keep reading</div>
${links}
</aside>`;
}
