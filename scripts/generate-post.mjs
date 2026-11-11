#!/usr/bin/env node
import { execFile } from "node:child_process";
import { appendFileSync, writeSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import OpenAI from "openai";
import YAML from "yaml";
import { SYSTEM_PROMPT, buildUserPrompt, RETRY_REMINDER } from "./lib/prompt.mjs";
import { countWords, countH2s } from "./lib/render.mjs";

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TOPICS_PATH = path.join(ROOT, "blog", "topics.yml");
const POSTS_DIR = path.join(ROOT, "blog", "posts");
const USED_PHOTOS_PATH = path.join(ROOT, "blog", "used-photos.json");

// Photo IDs already used by a previous post. Unsplash returns the same popular
// shots for similar queries ("lake", "sunset", "water"), so without this guard
// two posts can end up with the same scene even though the cropped files differ
// byte-for-byte. We skip any already-used photo at selection time and append
// newly-used IDs after a post is written.
const usedPhotoIds = new Set();
let usedPhotoLog = [];

async function loadUsedPhotos() {
  try {
    const data = JSON.parse(await fs.readFile(USED_PHOTOS_PATH, "utf8"));
    usedPhotoLog = Array.isArray(data) ? data : [];
  } catch {
    usedPhotoLog = [];
  }
  for (const entry of usedPhotoLog) {
    if (entry && entry.id) usedPhotoIds.add(entry.id);
  }
}

async function saveUsedPhotos() {
  await fs.writeFile(USED_PHOTOS_PATH, `${JSON.stringify(usedPhotoLog, null, 2)}\n`, "utf8");
}

function recordPhotoUse(photo, slug) {
  if (!photo?.id || usedPhotoIds.has(photo.id)) return;
  usedPhotoIds.add(photo.id);
  usedPhotoLog.push({
    id: photo.id,
    slug,
    photographer: photo.user?.name || "",
    url: photo.links?.html || "",
    used_at: todayUTC(),
  });
}

const XAI_BASE_URL = "https://api.x.ai/v1";
const MODEL = process.env.BLOG_MODEL || "grok-4.7";
const DRY_RUN = process.argv.includes("--dry-run");
const FORCE_SLUG = parseFlag("--topic-slug");
const POST_FILENAME_RE = /^(\d{4}-\d{2}-\d{2})-(.+)\.md$/;

function parseFlag(name) {
  const eq = process.argv.find(a => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith("--")) {
    return process.argv[idx + 1];
  }
  return null;
}

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function extractJSON(raw) {
  const trimmed = raw.trim();
  let depth = 0, start = -1;
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (c === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        return trimmed.slice(start, i + 1);
      }
    }
  }
  throw new Error("No balanced JSON object found in model output");
}

function buildChatRequest(topic, today) {
  return {
    model: MODEL,
    temperature: 0.7,
    max_tokens: 4500,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(topic, today) },
    ],
  };
}

async function callModel(client, request, attempt = 1) {
  const messages = request.messages.map(message => ({ ...message }));
  if (attempt > 1) {
    messages.push({ role: "user", content: RETRY_REMINDER });
  }
  const res = await client.chat.completions.create({
    model: request.model,
    temperature: request.temperature,
    max_tokens: request.max_tokens,
    messages,
  });
  const raw = res.choices?.[0]?.message?.content || "";
  try {
    const json = extractJSON(raw);
    return { parsed: JSON.parse(json), raw };
  } catch (err) {
    if (attempt < 2) {
      console.warn(`Parse failed (attempt ${attempt}): ${err.message}. Retrying with stricter reminder…`);
      return callModel(client, request, attempt + 1);
    }
    console.error("Raw model output:");
    console.error(raw);
    throw new Error(`Failed to parse JSON from model after 2 attempts: ${err.message}`);
  }
}

function validatePost(parsed) {
  const { title, description, markdown } = parsed;
  if (!title || typeof title !== "string") throw new Error("Missing title");
  if (title.length > 70) throw new Error(`Title too long (${title.length} chars, max 70)`);
  if (!description || typeof description !== "string") throw new Error("Missing description");
  if (description.length > 170) throw new Error(`Description too long (${description.length} chars, max 170)`);
  if (!markdown || typeof markdown !== "string") throw new Error("Missing markdown");
  const words = countWords(markdown);
  const h2s = countH2s(markdown);
  if (words < 850) throw new Error(`Word count too low: ${words}`);
  if (words > 1300) throw new Error(`Word count too high: ${words}`);
  if (h2s < 4) throw new Error(`Not enough H2 sections: ${h2s}`);
  return { words, h2s };
}

function buildFrontmatter(topic, post, wordCount, hero) {
  const fm = {
    title: post.title,
    description: post.description,
    date: todayUTC(),
    slug: topic.slug,
    keywords: topic.keywords || [],
    word_count: wordCount,
  };
  if (hero?.path) {
    fm.hero_image = hero.path;
    fm.hero_image_alt = hero.alt;
    if (hero.credit) fm.hero_image_credit = hero.credit;
    if (hero.credit_url) fm.hero_image_credit_url = hero.credit_url;
  }
  return `---\n${YAML.stringify(fm).trim()}\n---\n\n${post.markdown.trim()}\n`;
}

function unsplashKey() {
  return (process.env.UNSPLASH_ACCESS_KEY || "").trim();
}

async function fetchUnsplashPhoto(query, label = "img") {
  const key = unsplashKey();
  if (!key) return null;
  const q = (query || "fishing").trim();
  const searchUrl = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&orientation=landscape&per_page=30&content_filter=high`;
  console.log(`[${label}] Unsplash search: "${q}"`);
  let res;
  try {
    res = await fetch(searchUrl, {
      headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
    });
  } catch (err) {
    console.warn(`[${label}] Unsplash request threw: ${err.message}`);
    return null;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.warn(`[${label}] Unsplash search failed (${res.status}): ${body.slice(0, 200)}`);
    return null;
  }
  const data = await res.json();
  const results = data.results || [];
  if (results.length === 0) {
    console.warn(`[${label}] Unsplash returned no results for "${q}"`);
    return null;
  }
  // Prefer a photo no earlier post has used; only reuse if every candidate is taken.
  const photo = results.find(p => !usedPhotoIds.has(p.id)) || results[0];
  if (usedPhotoIds.has(photo.id)) {
    console.warn(`[${label}] all ${results.length} candidate(s) for "${q}" are already used — reusing ${photo.id}`);
  }
  // Trigger Unsplash download tracking per API guidelines (fire-and-forget)
  fetch(`${photo.links.download_location}?client_id=${key}`).catch(() => {});
  return { photo, query: q };
}

async function downloadUnsplashImage(photo, outPath, width = 1600, height = 840) {
  const imgUrl = `${photo.urls.raw}&w=${width}&h=${height}&fit=crop&q=80&fm=jpg`;
  const imgRes = await fetch(imgUrl);
  if (!imgRes.ok) return false;
  const buf = Buffer.from(await imgRes.arrayBuffer());
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, buf);
  console.log(`  saved ${path.relative(ROOT, outPath)} (${buf.length} bytes) — by ${photo.user?.name}`);
  return true;
}

function photoCredit(photo) {
  const photographer = photo.user?.name || "Unsplash photographer";
  const photographerUrl = photo.user?.links?.html
    ? `${photo.user.links.html}?utm_source=castlog&utm_medium=referral`
    : "https://unsplash.com";
  return { name: photographer, url: photographerUrl };
}

async function fetchHeroImage(query, slug) {
  const key = unsplashKey();
  console.log(`[hero] UNSPLASH_ACCESS_KEY present: ${Boolean(key)} (length=${key.length}); image_query from model: ${JSON.stringify(query)}`);
  if (!key) {
    console.warn("UNSPLASH_ACCESS_KEY not set — falling back to default header image.");
    return null;
  }
  const found = await fetchUnsplashPhoto(query, "hero");
  if (!found) return null;
  const relPath = `Images/blog/${slug}.jpg`;
  const ok = await downloadUnsplashImage(found.photo, path.join(ROOT, relPath));
  if (!ok) return null;
  recordPhotoUse(found.photo, slug);
  const credit = photoCredit(found.photo);
  const alt = found.photo.alt_description || found.photo.description || `${found.query} photo`;
  return {
    path: `/${relPath}`,
    alt,
    credit: `Photo by ${credit.name} on Unsplash`,
    credit_url: credit.url,
  };
}

async function injectInlineImages(markdown, slug) {
  const key = unsplashKey();
  if (!key) {
    console.warn("[inline] UNSPLASH_ACCESS_KEY not set — stripping inline image placeholders.");
    return { markdown: markdown.replace(/^\s*\[IMAGE:\s*[^\]]+\]\s*$/gm, ""), inline: [] };
  }
  const regex = /^\s*\[IMAGE:\s*([^\]]+)\]\s*$/gm;
  const matches = [...markdown.matchAll(regex)];
  console.log(`[inline] found ${matches.length} image placeholder(s)`);
  if (matches.length === 0) return { markdown, inline: [] };

  const inline = [];
  const replacements = [];
  let idx = 1;
  for (const m of matches) {
    const query = m[1].trim();
    const label = `inline-${idx}`;
    const found = await fetchUnsplashPhoto(query, label);
    if (!found) {
      replacements.push({ match: m[0], replacement: "" });
      idx++;
      continue;
    }
    const relPath = `Images/blog/${slug}-${idx}.jpg`;
    const ok = await downloadUnsplashImage(found.photo, path.join(ROOT, relPath), 1200, 800);
    if (!ok) {
      replacements.push({ match: m[0], replacement: "" });
      idx++;
      continue;
    }
    recordPhotoUse(found.photo, slug);
    const credit = photoCredit(found.photo);
    const alt = (found.photo.alt_description || found.photo.description || `${query} photo`)
      .replace(/"/g, "'")
      .slice(0, 140);
    const figure = `<figure class="inline-image"><img src="/${relPath}" alt="${alt}" loading="lazy"><figcaption>Photo by <a href="${credit.url}" rel="noopener nofollow">${credit.name}</a> on Unsplash</figcaption></figure>`;
    replacements.push({ match: m[0], replacement: figure });
    inline.push({ path: `/${relPath}`, alt, credit: `Photo by ${credit.name} on Unsplash`, credit_url: credit.url });
    idx++;
  }

  let out = markdown;
  for (const r of replacements) {
    out = out.replace(r.match, r.replacement);
  }
  return { markdown: out, inline };
}

export function slugFromPostPath(filePath) {
  if (!filePath || !String(filePath).includes("blog/posts/")) return null;
  const base = String(filePath).split("/").pop();
  const match = base.match(POST_FILENAME_RE);
  return match ? match[2] : null;
}

export function isBlogPr(pr) {
  const head = pr?.headRefName || "";
  const title = pr?.title || "";
  return head.startsWith("blog/") || title.toLowerCase().startsWith("weekly-blog");
}

function slugFromBlogBranch(head) {
  if (!head) return null;
  const manual = head.match(/^blog\/manual-\d{4}-\d{2}-\d{2}-(.+)$/);
  if (manual) return manual[1];
  const dated = head.match(/^blog\/\d{4}-\d{2}-\d{2}-(.+)$/);
  if (dated) return dated[1];
  return null;
}

export function slugsFromOpenBlogPrs(prs) {
  const slugs = new Map();
  for (const pr of prs || []) {
    if (!isBlogPr(pr)) continue;
    const reason = `open blog PR #${pr.number ?? "?"} (${pr.headRefName || pr.title || "blog"})`;
    const found = new Set();
    for (const file of pr.files || []) {
      const filePath = typeof file === "string" ? file : file?.path;
      const fromPost = slugFromPostPath(filePath);
      if (fromPost) found.add(fromPost);
      const indexMatch = String(filePath || "").match(/^blog\/([^/]+)\/index\.html$/);
      const change = typeof file === "string" ? "ADDED" : file?.changeType;
      if (indexMatch && indexMatch[1] !== "template" && (!change || change === "ADDED")) {
        found.add(indexMatch[1]);
      }
    }
    const bodyMatch = (pr.body || "").match(/\*\*Slug:\*\*\s*([A-Za-z0-9-]+)/);
    if (bodyMatch) found.add(bodyMatch[1]);
    const fromBranch = slugFromBlogBranch(pr.headRefName || "");
    if (fromBranch) found.add(fromBranch);
    for (const slug of found) {
      if (!slugs.has(slug)) slugs.set(slug, reason);
    }
  }
  return slugs;
}

export function selectTopic(topics, taken, forceSlug) {
  const skipped = [];
  if (forceSlug) {
    const topicIndex = topics.findIndex(topic => topic.slug === forceSlug);
    if (topicIndex === -1) {
      return { error: `Topic slug not found: ${forceSlug}`, skipped };
    }
    return { topic: topics[topicIndex], topicIndex, skipped };
  }
  let sawUnused = false;
  for (let i = 0; i < topics.length; i++) {
    const topic = topics[i];
    if (topic.used) continue;
    sawUnused = true;
    const reason = taken.get(topic.slug);
    if (reason) {
      skipped.push({ slug: topic.slug, reason });
      continue;
    }
    return { topic, topicIndex: i, skipped };
  }
  return { error: "empty", sawUnused, skipped };
}

export function emptyQueueMessage(topics, skipped) {
  const unused = (topics || []).filter(topic => !topic.used);
  if (unused.length === 0) {
    return "The topic queue is empty. Every topic in blog/topics.yml is marked used. Add new topics with used: false before the next Monday run.";
  }
  const lines = (skipped || []).map(skip => `- ${skip.slug}: ${skip.reason}`).join("\n");
  return `The topic queue has no eligible topic. ${unused.length} unused topic(s) were skipped because a post already exists on main or an open blog PR covers that slug:\n${lines}\nAdd new topics, or merge or close the blocking pull request.`;
}

function writeJobSummary(message) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  appendFileSync(summaryPath, `## Weekly blog generator failed\n\n${message}\n`);
}

function fail(message) {
  const annotation = process.env.GITHUB_ACTIONS ? `::error::${message.split("\n")[0]}\n` : "";
  writeSync(2, `${annotation}${message}\n`);
  writeJobSummary(message);
  process.exit(1);
}

async function slugsFromMainPosts() {
  const reasons = new Map();
  const onDisk = await fs.readdir(POSTS_DIR).catch(() => []);
  for (const file of onDisk) {
    const slug = slugFromPostPath(`blog/posts/${file}`);
    if (slug) reasons.set(slug, "post file already in blog/posts");
  }
  for (const ref of ["origin/main", "main"]) {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["ls-tree", "-r", "--name-only", ref, "blog/posts"],
        { cwd: ROOT, encoding: "utf8" },
      );
      for (const line of stdout.split("\n")) {
        const slug = slugFromPostPath(line.trim());
        if (slug) reasons.set(slug, "post file already on main");
      }
      break;
    } catch {
      // Try the next ref. The working tree still covers a main checkout.
    }
  }
  return reasons;
}

async function slugsFromGh() {
  try {
    const { stdout } = await execFileAsync(
      "gh",
      ["pr", "list", "--state", "open", "--limit", "100", "--json", "number,title,headRefName,body,files"],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    );
    const prs = JSON.parse(stdout || "[]");
    return slugsFromOpenBlogPrs(prs);
  } catch (err) {
    const detail = (err.stderr || err.message || String(err)).toString().trim().split("\n")[0];
    if (process.env.GITHUB_ACTIONS) {
      fail(`Could not list open blog PRs with \`gh pr list\` (${detail}). Refusing to pick a topic without the duplicate check.`);
    }
    console.warn(`Could not list open blog PRs with gh pr list (${detail}). Continuing with post files on main only.`);
    return new Map();
  }
}

async function collectTakenSlugs() {
  const onMain = await slugsFromMainPosts();
  const onPrs = await slugsFromGh();
  const mainCount = [...onMain.values()].filter(reason => reason === "post file already on main").length;
  console.log(`Post slugs on main: ${mainCount}`);
  if (onMain.size > mainCount) {
    console.log(`Other post files in blog/posts: ${onMain.size - mainCount}`);
  }
  console.log(`Open blog PR slugs: ${onPrs.size}`);
  const taken = new Map(onPrs);
  for (const [slug, reason] of onMain) taken.set(slug, reason);
  return taken;
}

async function main() {
  await fs.mkdir(POSTS_DIR, { recursive: true });
  await loadUsedPhotos();

  const today = todayUTC();
  const existing = await fs.readdir(POSTS_DIR).catch(() => []);
  const todayExists = existing.some(file => file.startsWith(`${today}-`));
  if (todayExists && !FORCE_SLUG && !DRY_RUN) {
    console.log(`Post for ${today} already exists — skipping.`);
    return;
  }

  const topicsRaw = await fs.readFile(TOPICS_PATH, "utf8");
  const doc = YAML.parseDocument(topicsRaw);
  const topics = doc.toJS().topics || [];
  const taken = await collectTakenSlugs();
  const selection = selectTopic(topics, taken, FORCE_SLUG);
  if (selection.error) {
    fail(selection.error === "empty" ? emptyQueueMessage(topics, selection.skipped) : selection.error);
  }
  const { topic, topicIndex, skipped } = selection;
  for (const skip of skipped) {
    console.log(`Skipping ${skip.slug} — ${skip.reason}`);
  }
  if (todayExists && DRY_RUN) {
    console.log(`Note: a post file for ${today} already exists. A real run without --topic-slug would skip.`);
  }

  console.log(`Generating post for topic: ${topic.slug} — "${topic.title}"`);
  console.log(`Model: ${MODEL}`);
  console.log(`Base URL: ${XAI_BASE_URL}`);

  const request = buildChatRequest(topic, today);
  if (DRY_RUN) {
    console.log("DRY_RUN=1");
    console.log(`TOPIC_SLUG=${topic.slug}`);
    console.log(`TOPIC_TITLE=${topic.title}`);
    console.log("=== request ===");
    console.log(JSON.stringify({ baseURL: XAI_BASE_URL, ...request }, null, 2));
    return;
  }

  const apiKey = (process.env.XAI_API_KEY || "").trim();
  if (!apiKey) {
    fail("XAI_API_KEY is not set. Add it as a repository secret under Settings → Secrets and variables → Actions before this job can generate a post.");
  }

  const client = new OpenAI({
    apiKey,
    baseURL: XAI_BASE_URL,
  });

  const { parsed } = await callModel(client, request);
  const { words } = validatePost(parsed);

  let hero = await fetchHeroImage(parsed.image_query, topic.slug);
  const { markdown, inline } = await injectInlineImages(parsed.markdown, topic.slug);
  parsed.markdown = markdown;

  // The dedicated hero fetch can miss (no Unsplash result, download error) even when
  // inline images succeed. Rather than silently fall back to the shared blog-header.jpg
  // — which produces duplicate heroes across posts — promote the first inline image to
  // the hero so every post still ships a unique header.
  if (!hero && inline.length > 0) {
    hero = inline[0];
    console.warn(`[hero] dedicated hero fetch missed — promoting first inline image (${hero.path}) to hero to avoid the shared fallback.`);
  }

  const filename = `${today}-${topic.slug}.md`;
  const filepath = path.join(POSTS_DIR, filename);
  const content = buildFrontmatter(topic, parsed, words, hero);
  await fs.writeFile(filepath, content, "utf8");
  await saveUsedPhotos();

  const topicsNode = doc.get("topics");
  const topicNode = topicsNode.get(topicIndex);
  topicNode.set("used", true);
  await fs.writeFile(TOPICS_PATH, doc.toString(), "utf8");

  const remaining = topics.filter((t, i) => i !== topicIndex && !t.used).length;
  if (remaining < 2) {
    console.warn(`WARNING: only ${remaining} unused topic(s) remain in topics.yml. Top it up.`);
  }

  console.log(`Wrote ${filepath}`);
  console.log(`POST_PATH=${path.relative(ROOT, filepath)}`);
  console.log(`POST_SLUG=${topic.slug}`);
  console.log(`POST_TITLE=${parsed.title}`);
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch(err => {
    const message = err?.message || String(err);
    console.error(err);
    writeJobSummary(`The weekly blog generator crashed.\n\n${message}`);
    process.exit(1);
  });
}
