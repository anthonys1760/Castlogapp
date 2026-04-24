# CastLog

**Your Fishing Journal, Finally Working For You.**

This repo is the pre-launch landing page for CastLog, a privacy-first fishing journal app positioned as the angler-owned alternative to Fishbrain (acquired by Aspira — a B2B government fishing-license software company — in November 2023). The page exists to drive waitlist signups from Reddit / Facebook traffic and validate demand before further app build-out.

**Live site:** https://anthonys1760.github.io/Castlogapp/

---

## Product Positioning

### Core thesis
Logging friction is the #1 reason anglers abandon fishing apps — not missing features. The moment between landing a fish and logging it is the worst possible time to use a phone: wet hands, flopping fish, ~10 seconds before release. Apps that need 6+ taps and 8 fields get abandoned after trip two.

### Conversion hooks (ordered by impact)
1. **Logging friction** — primary. "Under 15 seconds, 3 taps." Most universal pain, highest conversion.
2. **Aggressive paywalls** — Fishbrain charges ~$80/year and locked features users already had. "Free forever for core features."
3. **Spot burning / privacy** — real pain, but already table stakes (competitors offer private spots). Used as a trust signal, not a headline.
4. **Social feed nobody wants** — niche frustration, low priority.

### Through-line
**Fast logging → more data → better patterns → more fish.** Speed is the product. Personalized AI pattern intelligence is the payoff.

### Competitors
- **Fishbrain** — dominant, widely disliked post-acquisition. Paywalls ($80/yr). GPS strips photo metadata. Broken social feed.
- **FishAngler** — 1M+ downloads, 4.8★, free. Biggest direct threat — "Fishbrain but free."
- **Anglers' Log** — $12/yr, clean UX. Proves anglers pay for simplicity.
- **CastLog edge:** speed (15-sec log) + personalized AI pattern intelligence + no paywall on core — not privacy alone.

---

## App Capabilities (what the landing page claims CastLog does)

### 1. The Journal (shipping — primary screen)
Fast catch logging built for wet hands and one-handed use.
- **3 taps, under 15 seconds** per catch.
- **Auto-captured conditions:** GPS, weather, water temp, barometric pressure, moon phase, time of day — no manual entry.
- **Today's Haul view** — catch list with species, date/time, tags (saltwater/freshwater, game fish, popular, invasive, etc.), thumbnail photo.
- **Personal stats** — total catches, personal best (lb/oz), species count, per-bait / per-weather / per-time breakdowns.
- **Quote hook:** "I gave up after three trips because logging felt like homework."

### 2. Fish ID (shipping)
AI-powered species identification tied into regulations and the catch log.
- **94% accuracy** with confidence scoring across **300+ species**.
- **GPS-scoped regulations** auto-pulled at identification: min size, bag limit, season, license requirements — specific to the water body, not generic state data.
- **One-tap ID → logged catch** — species, weight, bait, GPS, weather pre-filled.
- **Private by default** — ID locations never harvested or fed to a community map.
- **Result card UI:** species photo, common + scientific name, tags (freshwater/game fish/popular/widespread), regulation panel, Log Catch / Release / Retry CTAs.

### 3. My Spots / Map (shipping)
Private-by-default spot tracking.
- **Pinned spots on-device**; not uploaded, not aggregated, not shared publicly.
- **Save Offline** option per-region for no-signal fishing.
- **Spots vs. Favorites tabs** — separate lists for personal pins vs. starred places.
- **Species-per-spot tracking** — e.g., "8 spots pinned · 7 species logged here."
- **No GPS harvesting from photos** — EXIF scrubbed.

### 4. Lake Intelligence (shipping)
Per-lake decision layer shown when you tap any lake.
- **Bite Score (0–100)** — synthesizes weather, pressure trend, water temp, and season into a single "is today worth it" number. This is the distinctive hook — Fishbrain does not offer an equivalent.
- **Live weather + barometric trend** — current conditions pulled by GPS, including inHg.
- **Seasonal water temp estimates** — spring/summer/fall/winter ranges, no sensor required.
- **AI lake overview** — geology, depth profile, formation history, species present. Regenerable.
- **Inline CTAs** — Directions + Log Catch direct from the lake page.
- **Quote hook:** "I used to check 4 apps before every trip."

### 5. AI Pattern Intelligence (roadmap — "Building next")
Personal pattern engine from logged catches + captured conditions. NOT generic fishing tips; NOT crowd-sourced data.
- **Automatic condition capture** on every catch (see Journal above).
- **Statistical correlation** after ~25+ catches — surfaces which bait, time, pressure trend, etc. work for *this user* on *this water*.
- **On-device / private by default** — pattern data never leaves the device in a form others can read.
- **Example insights (from landing page mockups):**
  - "You catch 73% more bass on overcast mornings when pressure is falling" — high confidence, 89 catches
  - "Topwater works best for you in the first 2 hours after sunrise" — 34 catches support this
  - "You've never caught a keeper here after 2pm" — 8 visits, pattern emerging
- **Positioning:** Early waitlist members get 3 months Pro Insights free at launch and start accruing pattern history immediately.

### 6. Other roadmap items
- Voice logging
- Apple Watch support

---

## Core Differentiation (vs. Fishbrain, per the comparison table)

| Capability | CastLog | Fishbrain (post-acquisition) |
|---|---|---|
| Private spots by default | ✓ | ✗ |
| No GPS harvesting from photos | ✓ | ✗ |
| Core logging — free forever | ✓ | ✗ ($9.95/mo) |
| AI pattern insights (personalized) | ✓ Personalized to you | Generic only |
| AI fish identification | ✓ Faster | ✓ |
| Inline local regs by GPS | ✓ | Pro only |
| Owned by anglers, not a corp | ✓ | ✗ (Aspira, Nov 2023) |
| No social feed clutter | ✓ | ✗ |
| Personal stats — always free | ✓ | ✗ (locked) |
| Full data export (CSV / JSON) | ✓ Always free | ✗ |
| Works fully offline | ✓ | ✗ Requires signal |

---

## Design System (for any LLM generating matching assets)

- **Background:** near-black `#0a0a0a`
- **Primary text:** warm off-white `#f5f2e8`
- **Muted text:** warm gray `#7a7668`
- **Amber** (primary CTAs, hero numbers, brand): `#e8a833`
- **Green** (positive indicators): `#6aab56`
- **Blue** (neutral data, Fish ID, Lake): `#5ba3c9`
- **Red** (problem callouts, betrayal timeline): reserved accent
- **Cards:** `#141412`, 1px subtle border, 14px radius, 3px colored left border for data cards
- **Fonts:** Playfair Display (serif, H1s), DM Sans (body), DM Mono (labels / meta / uppercase)
- **App chrome:** "CASTLOG" wordmark amber DM Mono top-left, settings gear top-right. Bottom tab bar: Home · Spots · center amber (+) FAB · Species · You.

---

## Copy Rules

- **Concrete over abstract** — "3 taps" beats "simple logging."
- **Quote real user pain** in callouts (e.g., "I gave up after three trips…", "I used to check 4 apps before every trip.").
- **Name competitors** when it builds credibility (Fishbrain comparison section is load-bearing).
- **Don't lead with privacy** — resonates only with ~10–15% of users and competitors already offer it.
- **Don't add new feature claims or screens** before validating current ones with real traffic.

---

## What's On The Page (section-by-section)

1. **Hero** — waitlist signup + animated iPhone stack (Journal / Fish ID / My Spots)
2. **Problem Section** — four pain points with real user quotes (logging speed, data held hostage, offline failure, app-juggling)
3. **Feature sections** — Journal → Fish ID → Lake Intelligence → AI Pattern Intelligence (roadmap)
4. **Betrayal Timeline** — Fishbrain's SoftBank → Aspira trajectory (2018 / Mar 2021 / Dec 2021 / Nov 2023)
5. **Comparison Table** — CastLog vs. Fishbrain
6. **Real Fishbrain Reviews** — 1–2★ App Store / Google Play quotes
7. **Philosophy quote** — "You learn more by *not catching fish* than catching them — but only if you've been keeping track."
8. **Final CTA** — waitlist signup with early-access perks (3 months Pro Insights free, export always free, no credit card)
9. **Footer** — "Built by an angler, for anglers — not investors."

---

## Distribution Strategy

Target subreddits: `r/fishing`, `r/bassfishing`, `r/flyfishing`, `r/Fishing_Gear`.

Lead with the frustration, not the app:

> "I built a fishing journal app because I gave up on Fishbrain after 3 trips. Logging a catch took longer than releasing the fish."

This framing outperforms "privacy-first fishing app" by a wide margin on fishing subs. See `REDDIT_PLAYBOOK.md` for the full playbook.

---

## Tech

Single `index.html` — no build step, no dependencies, no framework.

- Vanilla HTML/CSS/JS
- Google Fonts: Playfair Display, DM Sans, DM Mono
- All screen assets in `Images/` (PNG/JPEG phone screenshots)
- Hosted via GitHub Pages from `main` branch root

### Key files
- `index.html` — entire landing page
- `Images/journal_main.png` — Today's Haul screen (Journal)
- `Images/ai_fish_id_recreation_v5.png` — Fish ID result
- `Images/my_spots_v2.png` — Spots map
- `Images/lake_detail.png` — Lake Intelligence screen
- `Images/ai_patterns.jpeg` — AI Pattern Intelligence mockup (AI-generated)
- `CLAUDE.md` — landing-page voice / conversion rules (read this when editing copy)
- `REDDIT_PLAYBOOK.md` — post templates + subreddit strategy

### Deployment
Push to `main` → GitHub Pages redeploys automatically.
