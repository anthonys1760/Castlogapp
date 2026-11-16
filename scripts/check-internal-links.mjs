#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SKIP_DIRS = new Set(["node_modules", ".git", "scripts", "blog/posts", "blog/template"]);

async function walk(dir, files = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const rel = path.relative(ROOT, path.join(dir, entry.name));
    if (SKIP_DIRS.has(entry.name) || SKIP_DIRS.has(rel.replaceAll("\\", "/"))) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, files);
    else if (entry.name.endsWith(".html") || entry.name.endsWith(".xml")) files.push(full);
  }
  return files;
}

function toFile(href) {
  const clean = href.split("#")[0].split("?")[0];
  if (!clean.startsWith("/")) return null;
  if (clean === "/" || clean === "") return { asIndex: "index.html", asFile: "index.html" };
  const trimmed = clean.replace(/\/$/, "");
  return {
    asIndex: trimmed.slice(1) + "/index.html",
    asFile: trimmed.slice(1),
  };
}

async function exists(rel) {
  try {
    await fs.access(path.join(ROOT, rel));
    return true;
  } catch {
    return false;
  }
}

function pagePathStyleIssue(href) {
  const clean = href.split("#")[0].split("?")[0];
  if (clean.includes("index.html")) return `${href} points at index.html`;
  if (!clean || clean === "/") return null;
  const hasExt = /\.[a-z0-9]+$/i.test(clean);
  if (hasExt) return null;
  if (!clean.endsWith("/")) return `${href} is missing a trailing slash`;
  return null;
}

async function main() {
  const files = await walk(ROOT);
  const broken = [];
  const slashIssues = [];
  const hrefRe = /(?:href|src)=["'](\/[^"']+)["']/g;
  for (const file of files) {
    const html = await fs.readFile(file, "utf8");
    const relFile = path.relative(ROOT, file);
    for (const match of html.matchAll(hrefRe)) {
      const href = match[1];
      if (href.startsWith("//")) continue;
      const styleIssue = pagePathStyleIssue(href);
      if (styleIssue) slashIssues.push({ file: relFile, href: styleIssue });
      const mapped = toFile(href);
      if (!mapped) continue;
      const ok = (await exists(mapped.asIndex)) || (await exists(mapped.asFile));
      if (!ok) broken.push({ file: relFile, href });
    }
  }

  const canonicalRe = /<link rel="canonical" href="([^"]+)"/;
  const htmlFiles = files.filter(f => f.endsWith(".html"));
  const canonicalIssues = [];
  for (const file of htmlFiles) {
    const html = await fs.readFile(file, "utf8");
    const relFile = path.relative(ROOT, file).replaceAll("\\", "/");
    if (relFile.startsWith("blog/template/")) continue;
    const match = html.match(canonicalRe);
    if (!match) {
      canonicalIssues.push(`${relFile}: missing canonical`);
      continue;
    }
    const href = match[1];
    if (!href.startsWith("https://castlogapp.com/")) {
      canonicalIssues.push(`${relFile}: canonical is not absolute (${href})`);
    }
    if (href !== "https://castlogapp.com/" && !href.endsWith("/")) {
      canonicalIssues.push(`${relFile}: canonical missing trailing slash (${href})`);
    }
  }

  if (broken.length) {
    console.error("Broken internal links:");
    for (const row of broken) console.error(`  ${row.file} → ${row.href}`);
  }
  if (slashIssues.length) {
    console.error("Internal link style issues:");
    for (const row of slashIssues) console.error(`  ${row.file} → ${row.href}`);
  }
  if (canonicalIssues.length) {
    console.error("Canonical issues:");
    for (const row of canonicalIssues) console.error(`  ${row}`);
  }
  if (broken.length || slashIssues.length || canonicalIssues.length) process.exit(1);
  console.log(`Checked ${files.length} files. No broken internal links. Page URLs and canonicals use trailing slashes, never /index.html.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
