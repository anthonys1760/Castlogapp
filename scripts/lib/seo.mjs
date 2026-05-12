import { escapeXml, formatDateRFC822 } from "./render.mjs";

const SITE = "https://castlogapp.com";

export function buildSitemap(posts) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: `${SITE}/`, lastmod: today, changefreq: "weekly", priority: "1.0" },
    { loc: `${SITE}/blog/`, lastmod: today, changefreq: "weekly", priority: "0.8" },
    ...posts.map(p => ({
      loc: `${SITE}/blog/${p.slug}/`,
      lastmod: p.date,
      changefreq: "monthly",
      priority: "0.7",
    })),
  ];
  const body = urls
    .map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

export function buildFeed(posts) {
  const now = new Date().toUTCString();
  const items = posts
    .slice(0, 30)
    .map(p => `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${SITE}/blog/${p.slug}/</link>
      <guid isPermaLink="true">${SITE}/blog/${p.slug}/</guid>
      <pubDate>${formatDateRFC822(p.date)}</pubDate>
      <description><![CDATA[${p.description}]]></description>
    </item>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>CastLog Field Notes</title>
    <link>${SITE}/blog/</link>
    <description>Fast logging, AI patterns, and the apps that get in your way.</description>
    <language>en-us</language>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${now}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}

export function buildJsonLd(post) {
  const canonical = `${SITE}/blog/${post.slug}/`;
  const payload = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    image: [`${SITE}/Images/blog-header.jpg`],
    datePublished: post.date,
    dateModified: post.date,
    author: { "@type": "Person", name: "Anthony Smith", url: `${SITE}/` },
    publisher: {
      "@type": "Organization",
      name: "CastLog",
      logo: { "@type": "ImageObject", url: `${SITE}/Images/logo.png` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    keywords: (post.keywords || []).join(", "),
    wordCount: post.word_count,
    inLanguage: "en-US",
  };
  return JSON.stringify(payload);
}

export function buildBreadcrumbJsonLd(post) {
  const canonical = `${SITE}/blog/${post.slug}/`;
  const payload = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE}/blog/` },
      { "@type": "ListItem", position: 3, name: post.title, item: canonical },
    ],
  };
  return JSON.stringify(payload);
}

export { SITE };
