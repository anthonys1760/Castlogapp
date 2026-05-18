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

async function fetchHeroImage(query, slug) {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  console.log(`[hero] UNSPLASH_ACCESS_KEY present: ${Boolean(key)}; image_query from model: ${JSON.stringify(query)}`);
  if (!key) {
    console.warn("UNSPLASH_ACCESS_KEY not set — falling back to default header image.");
    return null;
  }
  const q = (query || "fishing").trim();
  const searchUrl = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&orientation=landscape&per_page=10&content_filter=high`;
  console.log(`[hero] Unsplash search: "${q}"`);
  let res;
  try {
    res = await fetch(searchUrl, {
      headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
    });
  } catch (err) {
    console.warn(`[hero] Unsplash request threw: ${err.message} — falling back.`);
    return null;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.warn(`[hero] Unsplash search failed (${res.status}): ${body.slice(0, 200)} — falling back.`);
    return null;
  }
  const data = await res.json();
  console.log(`[hero] Unsplash returned ${data.results?.length || 0} results`);
  const photo = (data.results || [])[0];
  if (!photo) {
    console.warn(`Unsplash returned no results for "${q}" — falling back to default.`);
    return null;
  }
  const imgUrl = `${photo.urls.raw}&w=1600&h=840&fit=crop&q=80&fm=jpg`;
  const imgRes = await fetch(imgUrl);
  if (!imgRes.ok) {
    console.warn(`[hero] Unsplash image download failed (${imgRes.status}) — falling back.`);
    return null;
  }
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const outDir = path.join(ROOT, "Images", "blog");
  await fs.mkdir(outDir, { recursive: true });
  const relPath = `Images/blog/${slug}.jpg`;
  await fs.writeFile(path.join(ROOT, relPath), buf);
  console.log(`[hero] saved ${relPath} (${buf.length} bytes) — by ${photo.user?.name}`);

  // Trigger Unsplash download tracking per API guidelines
  fetch(`${photo.links.download_location}?client_id=${key}`).catch(() => {});

  const photographer = photo.user?.name || "Unsplash photographer";
  const photographerUrl = photo.user?.links?.html ? `${photo.user.links.html}?utm_source=castlog&utm_medium=referral` : "https://unsplash.com";
  const alt = photo.alt_description || photo.description || `${q} photo`;
  return {
    path: `/${relPath}`,
    alt,
    credit: `Photo by ${photographer} on Unsplash`,
    credit_url: photographerUrl,
  };
}

async function main() {
  await fs.mkdir(POSTS_DIR, { recursive: true });

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

  const hero = await fetchHeroImage(parsed.image_query, topic.slug);

  const filename = `${today}-${topic.slug}.md`;
  const filepath = path.join(POSTS_DIR, filename);
  const content = buildFrontmatter(topic, parsed, words, hero);
  await fs.writeFile(filepath, content, "utf8");

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
