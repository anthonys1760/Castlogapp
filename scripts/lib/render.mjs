import { marked } from "marked";

marked.setOptions({
  gfm: true,
  breaks: false,
  headerIds: false,
  mangle: false,
});

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/&[a-z]+;/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function injectHeadingAnchors(html) {
  return html.replace(/<h([23])>([\s\S]+?)<\/h\1>/g, (_, level, content) => {
    const text = content.replace(/<[^>]*>/g, "");
    const slug = slugify(text);
    if (level === "2") {
      return `<h2 id="${slug}"><a class="h-anchor" href="#${slug}" aria-hidden="true">#</a>${content}</h2>`;
    }
    return `<h3 id="${slug}">${content}</h3>`;
  });
}

export function renderMarkdown(md) {
  return injectHeadingAnchors(marked.parse(md));
}

export function extractToc(md) {
  return md
    .split("\n")
    .filter(l => /^##\s+/.test(l) && !/^###/.test(l))
    .map(l => l.replace(/^##\s+/, "").trim())
    .map(text => ({ text, slug: slugify(text) }));
}

export function buildTocBlock(toc) {
  if (toc.length < 4) return "";
  const items = toc
    .map(t => `    <li><a href="#${t.slug}">${escapeHtml(t.text)}</a></li>`)
    .join("\n");
  return `<nav class="toc" aria-label="Table of contents">
  <div class="toc-label">In this article</div>
  <ol>
${items}
  </ol>
</nav>`;
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
