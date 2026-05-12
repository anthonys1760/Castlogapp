#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import {
  renderMarkdown,
  countWords,
  readingTime,
  formatDateHuman,
  escapeHtml,
  renderTemplate,
  pickRelated,
  buildRelatedBlock,
  extractToc,
  buildTocBlock,
} from "./lib/render.mjs";
import { buildSitemap, buildFeed, buildJsonLd, buildBreadcrumbJsonLd, SITE } from "./lib/seo.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const POSTS_DIR = path.join(ROOT, "blog", "posts");
const BLOG_DIR = path.join(ROOT, "blog");
const TEMPLATE_DIR = path.join(BLOG_DIR, "template");

async function loadPosts() {
  await fs.mkdir(POSTS_DIR, { recursive: true });
  const files = (await fs.readdir(POSTS_DIR)).filter(f => f.endsWith(".md"));
  const posts = [];
  for (const file of files) {
    const raw = await fs.readFile(path.join(POSTS_DIR, file), "utf8");
    const parsed = matter(raw);
    const data = parsed.data;
    if (!data.slug || !data.title || !data.date) {
      console.warn(`Skipping ${file}: missing required frontmatter`);
      continue;
    }
    const words = data.word_count || countWords(parsed.content);
    posts.push({
      slug: data.slug,
      title: data.title,
      description: data.description || "",
      date: typeof data.date === "string" ? data.date : new Date(data.date).toISOString().slice(0, 10),
      keywords: data.keywords || [],
      word_count: words,
      reading_time: readingTime(words),
      content_md: parsed.content,
      filename: file,
    });
  }
  posts.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
  return posts;
}

async function renderPost(post, allPosts, postTemplate) {
  const html = renderMarkdown(post.content_md);
  const toc = extractToc(post.content_md);
  const tocBlock = buildTocBlock(toc);
  const related = pickRelated(allPosts, post.slug, 2);
  const relatedBlock = buildRelatedBlock(related);
  const canonical = `${SITE}/blog/${post.slug}/`;
  const jsonld = buildJsonLd(post);
  const breadcrumb_jsonld = buildBreadcrumbJsonLd(post);

  const tokens = {
    title: escapeHtml(post.title),
    description: escapeHtml(post.description),
    date_iso: post.date,
    date_human: formatDateHuman(post.date),
    slug: post.slug,
    reading_time: String(post.reading_time),
    toc_block: tocBlock,
    content_html: html,
    related_block: relatedBlock,
    canonical,
    jsonld,
    breadcrumb_jsonld,
  };

  return renderTemplate(postTemplate, tokens);
}

function renderCard(post) {
  return `  <a href="/blog/${post.slug}/" class="post-card">
    <div class="post-card-meta">${formatDateHuman(post.date)} · ${post.reading_time} min</div>
    <h2>${escapeHtml(post.title)}</h2>
    <p>${escapeHtml(post.description)}</p>
    <span class="post-card-read">Read post →</span>
  </a>`;
}

async function renderIndex(posts, indexTemplate) {
  const cards = posts.length
    ? posts.map(renderCard).join("\n")
    : `  <div class="empty">No posts yet. Check back Monday.</div>`;
  return renderTemplate(indexTemplate, { post_cards: cards });
}

async function main() {
  const posts = await loadPosts();
  console.log(`Loaded ${posts.length} post(s)`);

  const postTemplate = await fs.readFile(path.join(TEMPLATE_DIR, "post.html"), "utf8");
  const indexTemplate = await fs.readFile(path.join(TEMPLATE_DIR, "index.html"), "utf8");

  for (const post of posts) {
    const outDir = path.join(BLOG_DIR, post.slug);
    await fs.mkdir(outDir, { recursive: true });
    const html = await renderPost(post, posts, postTemplate);
    await fs.writeFile(path.join(outDir, "index.html"), html, "utf8");
    console.log(`  ✓ blog/${post.slug}/index.html`);
  }

  const indexHtml = await renderIndex(posts, indexTemplate);
  await fs.writeFile(path.join(BLOG_DIR, "index.html"), indexHtml, "utf8");
  console.log("  ✓ blog/index.html");

  const sitemap = buildSitemap(posts);
  await fs.writeFile(path.join(ROOT, "sitemap.xml"), sitemap, "utf8");
  console.log("  ✓ sitemap.xml");

  const feed = buildFeed(posts);
  await fs.writeFile(path.join(ROOT, "feed.xml"), feed, "utf8");
  console.log("  ✓ feed.xml");

  console.log("Build complete.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
