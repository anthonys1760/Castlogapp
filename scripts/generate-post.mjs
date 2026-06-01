#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import YAML from "yaml";
import { SYSTEM_PROMPT, buildUserPrompt, RETRY_REMINDER } from "./lib/prompt.mjs";
import { countWords, countH2s } from "./lib/render.mjs";

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

const MODEL = process.env.BLOG_MODEL || "anthropic/claude-sonnet-4.6";
const DRY_RUN = process.argv.includes("--dry-run");
const FORCE_SLUG = parseFlag("--topic-slug");

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

async function callModel(client, userPrompt, attempt = 1) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];
  if (attempt > 1) {
    messages.push({ role: "user", content: RETRY_REMINDER });
  }
  const res = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.7,
    max_tokens: 4500,
    messages,
  });
  const raw = res.choices?.[0]?.message?.content || "";
  try {
    const json = extractJSON(raw);
    return { parsed: JSON.parse(json), raw };
  } catch (err) {
    if (attempt < 2) {
      console.warn(`Parse failed (attempt ${attempt}): ${err.message}. Retrying with stricter reminder…`);
      return callModel(client, userPrompt, attempt + 1);
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

async function main() {
  await fs.mkdir(POSTS_DIR, { recursive: true });
  await loadUsedPhotos();

  const today = todayUTC();
  const existing = await fs.readdir(POSTS_DIR).catch(() => []);
  if (existing.some(f => f.startsWith(`${today}-`) && !FORCE_SLUG)) {
    console.log(`Post for ${today} already exists — skipping.`);
    return;
  }

  const topicsRaw = await fs.readFile(TOPICS_PATH, "utf8");
  const doc = YAML.parseDocument(topicsRaw);
  const topics = doc.toJS().topics || [];

  let topic;
  let topicIndex = -1;
  if (FORCE_SLUG) {
    topicIndex = topics.findIndex(t => t.slug === FORCE_SLUG);
    if (topicIndex === -1) {
      console.error(`Topic slug not found: ${FORCE_SLUG}`);
      process.exit(1);
    }
    topic = topics[topicIndex];
  } else {
    topicIndex = topics.findIndex(t => !t.used);
    if (topicIndex === -1) {
      console.log("All topics are used. Add more to blog/topics.yml.");
      return;
    }
    topic = topics[topicIndex];
  }

  console.log(`Generating post for topic: ${topic.slug} — "${topic.title}"`);
  console.log(`Model: ${MODEL}`);

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("OPENROUTER_API_KEY is not set");
    process.exit(1);
  }

  const client = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://castlogapp.com",
      "X-Title": "CastLog Blog Generator",
    },
  });

  const userPrompt = buildUserPrompt(topic, today);
  const { parsed, raw } = await callModel(client, userPrompt);

  if (DRY_RUN) {
    console.log("=== DRY RUN ===");
    console.log(`Title: ${parsed.title}`);
    console.log(`Description: ${parsed.description}`);
    console.log(`Word count (model reported): ${parsed.word_count}`);
    const { words, h2s } = validatePost(parsed);
    console.log(`Word count (computed): ${words}`);
    console.log(`H2 sections: ${h2s}`);
    console.log("--- markdown preview (first 500 chars) ---");
    console.log(parsed.markdown.slice(0, 500));
    return;
  }

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

main().catch(err => {
  console.error(err);
  process.exit(1);
});
