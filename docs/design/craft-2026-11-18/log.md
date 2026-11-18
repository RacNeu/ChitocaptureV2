# Craft pass: ChitoCapture interface (18 Nov 2026)

## Brief

ChitoCapture is a carbon accounting and real-time monitoring platform for Malaysian steel mills (induction-furnace mini-mills and downstream wire plants). People: plant engineers, the sustainability team and management. They open it daily, on desktop in the office and on phones on the plant floor. It should feel exact, trustworthy and calm, with the weight of heavy industry.

The bar: Awwwards Site of the Day for the web app, Apple Design Award (Interaction, Visuals and Graphics) for its product feel.

## Constraints from the owner

- Keep the **old emerald look**: dark-emerald sidebar, green accents, soft cards, the factory illustrations, the login glow. A graphite redesign was tried and rejected on 18 Nov.
- Keep the **moment**: figures in IBM Plex Mono with their unit and a source tag (`bills`, `meter`, `forecast`, `live`, `template`).
- Keep the **calm motion**: no page fades, no chart draw-ins, no hover lifts; live things may pulse.
- Keep all features, content and section order. Don't invent features or claims.
- The greeting stays time-based ("Good afternoon, <site>").

## Tools

- `interface-craft`, `apple-design`, `animate` and `emil-design-eng` skills are not installed on this machine; the pass uses Disney's 12 principles and the charles-* skills.
- No image-generation keys in `.env.local` or the environment (names checked, values never read).
- Captures: headless Edge over CDP with the built-in DEMO account and `samples/masteel-monthly-test.csv`; motion and comparison pages with the skill's `web-frames.mjs` (Chrome via `CHROME_PATH`).

## 1. Directions (explored on Site overview, same data)

Rendered by injecting each direction's CSS and DOM into the running app: `directions.png`.

| | Direction | Idea | Verdict |
|---|---|---|---|
| Now | Current | Old emerald look, mono figures, source tags | Four unchosen tile hues; every card weighs the same; Scope 2 is a wall of saturated blue |
| A | Certificate, refined | Same layout, harmonised: one tile tint, one trace colour, calmer chart blue | Fixes noise, adds no idea. 7 at best |
| **B** | **Control desk** | The sidebar's emerald continues into a desk band holding the one figure a mill is judged by (tCO₂e per tonne of steel) with its 12-month trace; the other figures are instruments beside it | **Recommended**: one figure leads, the page answers "how clean is our steel?" at a glance, live figures can roll like a desk counter |
| C | Cooling steel (risk) | Provenance as temperature: estimates glow ember, bill figures are cooled steel ink, live is emerald; stencil numerals after billet heat numbers | Most original, least usable: ember reads as an alarm, stencil digits slow down tables |

Obvious choices named and passed over: equal KPI card row (everyone's dashboard), gradient hero blob, fade-up on every card.

**Decision (owner, 18 Nov):** A, Certificate refined, "no need too dull". So: harmonise without muting. Tile hues get meanings instead of being flattened to one tint; chart colours stay vivid.

## 2. System (found in the existing UI, written down)

**Colour: one meaning per hue.** Tiles use the hue at 16% over white; text uses the ink step.

| Token | Hue | Means | Fill / tint / ink |
|---|---|---|---|
| brand | emerald | the action, money saved, good change | `#10b981` / `#ecfdf5` / `#047857` |
| electricity | blue | emissions, Scope 2, grid | `#2a78d6` / `#e8f1fb` / `#1d5fae` |
| fuel | orange | Scope 1, fuel and process heat | `#eb6834` / `#fdeee6` / `#b4471b` |
| intensity | teal | per-tonne figures | `#0d9488` / `#e6f6f4` / `#0f766e` |
| caution | amber | targets, forecasts, estimates | `#f59e0b` / `#fef3c7` / `#b45309` |
| alarm | rose | risks, bad change | `#e11d48` / `#ffe4e6` / `#be123c` |
| neutrals | slate | page `#f4f6fa`, raised `#f1f5f9`, card `#fff`, line `#e3e8ef`, ink `#1e293b` / `#475569` / `#5b6779` |
| chrome | dark emerald | sidebar `#0d2b28`, active `#134e43`, ink `#cfe3dd`, label `#a3c4bb` |

Violet has no meaning, so it leaves the chrome (it stays only as a 4th category in finding kinds and site colours).

**Type.** Inter 400/500/600/700 for the interface. IBM Plex Mono 600 with tabular digits for figures only, never for names. Sizes: 11.5 meta, 12.5 labels, 13.5 small body, 15 body, 17 card titles, 26 page titles, 26–30 card figures.

**Shape and depth.** Cards 16 px radius with the soft two-layer shadow; buttons 10; fields 8; tags 5. One depth cue per surface.

**Motion.** `--ease-enter` `cubic-bezier(.32,.72,0,1)`, `--ease-exit` `cubic-bezier(.55,0,1,.45)`, `--ease-move` `cubic-bezier(.77,0,.175,1)`; press 120 ms, pop 200 ms, sheet 250 ms, exit 180 ms.

**Signature: the certificate.** Every headline figure carries a mono source tag: `bills`, `meter`, `forecast`, `estimate`, `live`, `template`. When bills are imported, the tags stamp onto the new figures once: the one choreographed moment in the app.

## Status when stopped (owner asked to stop, 18 Nov ~21:50)

Done: system written down; Home tiles one meaning per hue (violet → blue, sky → teal); `bills` / `estimate` tags on Energy & carbon and Company figures via one `SourceTag` component; the import stamp (frames read once, two defects found and fixed in CSS, fix not re-captured); fonts load the weights the CSS asks for (Inter 400–800, Plex Mono 500–600); favicon now the leaf mark; touch icon; description, theme colour and Open Graph text.

Not done: social preview image (`og:image` removed until one exists), responsive sweep of the new tags at 360–1920, fresh-critic round, final zero-mistakes pass.
