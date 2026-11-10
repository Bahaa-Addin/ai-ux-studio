# Code map for the live plan, phases 1, 1b and 2 (2026-11-10)

A read-only survey made by four parallel readers at the start of the live plan (`docs/handoff/live-demos-way2.md` at the repository root), on `feature/live-way2` before phase 0's merges and the move of `vodafone-services-clone/` to `experiences/`. Paths and line numbers are as they were then: the Pocket's files have since changed (actors, portal), and the folder is now `experiences/`. Nothing here is a decision; decisions are ADRs. What later phases must settle is also in `docs/qa/bugs-and-open-issues.md` (O23–O28).

Each area lists where the plan and the code disagree, the risks, the open questions, and a design sketch grounded in the code.

## 1. Phase 1: delivery of aixc.js, and trail host version 2

### Plan and code disagree

- Plan 3.1 says the gateway serves `voice-guide/dist/sdk/aixc/`. The SDK output is `voice-guide/packages/sdk/dist` (build.ts:14, server.ts:50), so the aixc output belongs in `voice-guide/packages/sdk/dist/aixc/`, which is git-ignored via voice-guide/.gitignore `dist/`.
- Plan 3.1 says 'same route family as guide.js'. The existing `/sdk/:file` route cannot serve `/sdk/aixc/<file>`: ':file' compiles to '([^/]+)' (services/shared/http.ts:47-49), and the filename regex at server.ts:84 allows only .js and .js.map. A new route is required.
- Plan 3.1 wants the meta added 'at document start'. The loader's add() runs at DOMContentLoaded (demo-browser.ts:90-91), and the trail reads the meta only when TrailController is constructed, which is after guide start, the /v1/session round trip and a 600 ms timeout (guide.ts:164, controller.ts:136). Document start is not needed; appending it in add() before guide.js is enough.
- An unconditional loader meta contradicts existing tests. pocket-journey.e2e.test.ts:136-154 and :156-180 require non-host pages to navigate to hostUrl (`/en/services#journey`, `/ar/services#journey`). With the meta on every page, togglePill dispatches vg:trail-open and returns (controller.ts:366), so no navigation happens.
- Phase 0.4 says 'update ... CI workflow paths'. .github/workflows/voice-guide.yml has no reference to vodafone-services-clone. It only triggers on 'voice-guide/**' (line 7), so the change is to add `experiences/**`, not to rename a path.
- Plan 3.1 assumes `loader: { '.css': 'text' }` suffices. The clone's modules never import CSS: index.html links 26 stylesheets (lines 19-46), and on-demand CSS and SVG are loaded with `new URL('./x', import.meta.url)` (personalization/index.js:38, tips/entry.js:42, pocket/pocket-actors.js:46-47, voicetut-loader.js:12). Bundled, these resolve to /__vg/sdk/aixc/*.css or *.svg, which the route refuses. Whether esbuild 0.28.2 rewrites `new URL(..., import.meta.url)` is not verified (could not build under read-only).
- Plan 3.3 names the output root `<div id="aixc-output">`. The clone's CSS and shell use `#experience-output` (pocket.css has 7 references, including ADR-0044's `:has(#experience-output:not([hidden]))`; shell.js:279). Renaming the id means editing those selectors, or PageHost keeps `experience-output`.
- Phase 1 check: 'demo:live -- --replay loads aixc.js on every page of the replay fixture'. demo-live mounts the clone by default in replay (demo-live.ts:71, 161-168). /en/services and /ar/services would then carry both the clone's main.js and static meta (index.html:13, 50) and aixc.js, a double layer, unless the loader excludes clone paths or the run uses --clone off.
- ADR number collision. The plan (phase 1.2) assigns ADR-0048 to the delivery plus trail-host meta decision. The demo 5 revamp Part A assigns ADR-0048 to 'trail remembers what questions were about; host interface v2' and says '0047 and the planned seed() are reserved'. 0047 is now VoiceTut (voice-guide/docs/adr/0047-voicetut-speaks-for-the-guide.md); the highest existing ADR is 0047.
- Plan 3.6 says 'Reset demo' clears the trail (clearAll and consent). There is no way to return consent to 'unset': writeConsent excludes 'unset' (consent.ts:27), and hostApi exposes only clear/clearAll/turnOff (controller.ts:573-575).
- Plan 2 says guide.js is 20,401 of 20,480 bytes; the revamp says it is 27-79 B under budget. The existing dist (built 2026-11-10 17:26) measures 20,293 bytes with `gzip -9 -c`, which is 187 B under. Caveats: the CLI gzip header differs slightly from node zlib, the dist may be stale relative to source, and nothing was rebuilt (read-only). trail.js measures 27,144 of 30,720, about 3.5 KB of room, consistent with the revamp.
- Revamp Part A: 'ask gets the two-letter language fallback that journey.js already uses'. Confirmed missing in the SDK: controller.ts:566 uses sel.questions[this.g.lang] only.
- Plan 3.6 'imported through a new consent-gated seed() ... that writes with TrailStore.putSession/putChunk/putInterest'. Direct puts are not enough. #writeIndex re-puts the in-memory session (controller.ts:928-929). The timeline shows only this.session (516-538). #currentSession discards sessions that are expired, older than maxSessionMs (30 min) or from another site (616). planEviction drops expired sessions (storage.ts:33). The seed must go through the controller and rebase times.
- Plan 2 says hard-coded clone selectors are at journey.js:56, shared.js:256, coach.js:93 and voicetut/demo.js:246, and pocket.js:672 finds cards. All verified at those lines.

### Risks

- A dead 'Your journey' pill. If the loader adds the vg-trail-host meta while nothing hosts the journey (phase 1 has no Pocket; the layer is off via ?aixc=off or per-demo switch; the layer failed and tore itself down), togglePill dispatches vg:trail-open to no listener (controller.ts:366) and the view never opens its sheet (view.ts:497). Because `hosted` is read once (controller.ts:136), failure isolation cannot undo it.
- Double layer in replay. The clone pages (/en/services, /ar/services) already run main.js and declare the meta. With experiences enabled in vodafone-eg.yaml, every e2e suite using vodafone-pocket.ts (pocket-journey, reimagine-floating, tips) also gets aixc.js on those pages. From phase 3 that means two Pockets on one aixc.pocket.v1 key.
- zod strips unknown keys (SiteConfig at config.ts:100). An `experiences:` yaml block without a schema change is silently ignored, so the layer would never load and nothing would error.
- buildSdk is called by every e2e file and the size test (vodafone-pocket.ts:49, sdk-size.test.ts:19, live-replay:41, demo-live.ts:74). If buildAixc throws because experiences/src/host/index.js does not exist yet (phase 0 move and phase 1.1 not done), every suite fails. Guard on existence.
- Hashed chunk names. Stale chunks accumulate in dist/aixc across builds unless the folder is cleaned. Per-chunk budgets need a metafile or manifest. How esbuild names dynamic-import chunks ([name] versus 'chunk') is unverified.
- Module scripts need strict JavaScript MIME and, cross-origin (Mode A), CORS. The current headers (text/javascript, ACAO *) satisfy both. Keep them on the new route.
- seed() exposed to any page script. voiceGuide.trailHost is readable by any script (revamp O23), and hostApi already exposes allow() (controller.ts:569), so a host could grant consent itself. seed() must be gated server-side (a demo-only trail.seed setting) and validate every step, chunk and event (isStep, isChunk, isEvent, decodeChunk) and byte and step limits.
- Bumping hostApi to version 2 breaks the clone's journey (journey.js:503 strict !== 1) and pocket-journey e2e unless journey.js changes in the same commit. The in-flight worktrees (.worktrees/*) carry their own journey.js copies.
- Wrapping g.request and g.api.post to record asked questions. Overlapping turns could misattribute an origin. Use a per-call token, unwrap in destroy, and never store the utterance or plan.say.
- Rebasing seeded timestamps. Shifting session and step times is cheap, but rrweb event timestamps inside chunks (t0/t1, firstEventAt, durationMs) must stay consistent with what the replayer uses. Unverified whether the replayer needs absolute event times to match step.firstEventAt.
- The vodafone-eg origins include eshop (yaml:16). The guide's origin allow-list (demo-browser.ts:76) would also admit aixc.js on eshop unless experiences is restricted to the web origin. /spa/ pages are Angular; whether they have #main-content is not verified.

### Open questions

- Which ADR number goes with which decision? The plan gives ADR-0048 to aixc delivery plus the trail-host meta. The revamp gives ADR-0048 to trail host v2. Proposal: one ADR for delivery (loader, build, route, config, kill switches, 'no loader meta; hosting is claimed at runtime') and one for trail host interface v2 (asked, claim, seed, resetConsent). The owner should confirm the numbering.
- Should seed() be gated by a server-sent demo-only setting (trail.seed), given that any page script can reach voiceGuide.trailHost and the host API already has allow()?
- Does the replayer depend on absolute rrweb event timestamps matching step.firstEventAt and durationMs? This decides whether seed() must rewrite event timestamps inside chunks or only session and step times.
- esbuild 0.28.2 naming of dynamic-import chunks with chunkNames '[name]-[hash]' (source file name or 'chunk'), and whether it rewrites `new URL(x, import.meta.url)`. Not verifiable without building (read-only).
- Should experiences be limited to the web origin and to /(en|ar)/ paths? It is not verified whether /spa/ pages (Angular) have #main-content.
- Should PageHost keep the id `experience-output` (clone CSS has 7 references in pocket.css) or rename to `aixc-output` per plan 3.3 and edit the CSS?
- How should demo switches reach aixc.js under Mode A: data attributes written by the loader (proposed) or a gateway endpoint? /v1/session belongs to the guide, and the layer should not depend on it.
- Should claim() also be how the clone's static-meta host declares itself in v2? If so, the meta could be retired at phase 9.

### Design sketch

(1) LOADER: META VERSUS 'hosted' GETTER

Loader change in voice-guide/tools/demo-browser.ts.

Extend the signature:
`loaderScript(o: { siteKey: string; origins: string[]; xray?: string; experiences?: { origin: string; paths: string[]; exclude: string[]; demos: string[] } | null })`

Inside add() (79-89), after appending guide.js, insert:
```js
const x = ${JSON.stringify(o.experiences ?? null)}
if (x && location.origin === x.origin && !/[?&]aixc=off(&|$)/.test(location.search)
  && x.paths.some((p) => new RegExp(p).test(location.pathname)) && !x.exclude.includes(location.pathname.replace(/\/$/, ''))
  && !document.querySelector('script[data-aixc-demo], meta[name="vg-trail-host"]')) {
  const m = document.createElement('script')
  m.type = 'module'
  m.src = location.origin + '/__vg/sdk/aixc/aixc.js'
  m.dataset.aixcDemo = '1'
  m.dataset.aixcSiteKey = siteKey
  m.dataset.aixcDemos = x.demos.join(' ')
  ;(document.head || document.documentElement).appendChild(m)
}
```
Notes on that block:
- The existing `script[data-vg-loader]` guard (80) must not short-circuit this second tag.
- The `meta[name=vg-trail-host]` check skips the clone pages, which declare it statically at index.html:13.
- In launchDemoBrowser (191), build `experiences` from o.site.experiences: origin = the web origin, exclude = o.clone ? [clone.path, ...Object.keys(clone.pages ?? {})] : []. Add a DemoBrowserOptions.experiences?: boolean override.
- aixc.js finds its tag with `document.querySelector('script[type=module][src*="/sdk/aixc/aixc.js"]')`, or uses import.meta.url. It derives the gateway as import.meta.url minus `/sdk/aixc/aixc.js`, like index.ts:19-20.
- aixc.js checks ?aixc=off itself too, so Mode A (tag manager) gets the same kill switch.

Option A: the loader adds `<meta name=vg-trail-host content=pocket data-aixc>`.
- Pros: zero bytes in guide.js or trail.js, and host.ts:7 is unchanged.
- Cons: a dead pill in phase 1, because nothing listens for vg:trail-open (controller.ts:366, view.ts:497).
- Cons: it breaks the hostUrl tests (pocket-journey.e2e.test.ts:136, 156).
- Cons: it cannot be reverted by section 3.8 isolation, because `hosted` is readonly (136).
- Cons: Mode A would need a third tag, while plan 3.1 promises 'the same two tags'.
- If chosen anyway, add it inside add(), not at init time. Init scripts run before <head> exists, and the controller is built much later (guide.ts:164).

Option B (recommended): `hosted` becomes live.
- In controller.ts:136: `#claims = 0; get hosted(): boolean { return this.#claims > 0 || !!document.querySelector('meta[name="vg-trail-host"]') }`.
- Host API v2 gains `claim(): () => void`. It increments the count, re-renders, and if SS 'open' is set dispatches vg:trail-open, mirroring 585-588. The returned release decrements and re-renders.
- The layer calls claim() only once its journey host has attached (phase 3, journey.js attach at 502-512). Its isolation teardown calls release, and the pill falls back to hostUrl or the guide's own sheet.
- Every reader (366, 498, 510, 585, 1011, 1014, 1042) becomes live. It costs a few bytes in trail.js (about 3.5 KB of room) and nothing in guide.js.
- The static meta stays valid for the clone, so demo-walkthrough.ts:196 and pocket-journey:58 keep passing.
- Phase 1 therefore adds no meta, keeps hostUrl, and changes no pill behaviour. Phase 3 removes hostUrl (config.ts:213, yaml:160, controller.ts:367-371).
- Record this in the delivery ADR. The ADR number is contested (see mismatches).

(2) BUILD AND GATEWAY ROUTE

In voice-guide/packages/sdk/build.ts:
```ts
const EXPERIENCES = path.resolve(ROOT, '../experiences') // until the move: '../vodafone-services-clone'
export const AIXC_OUT = path.join(OUT, 'aixc')
async function buildAixc(minify: boolean): Promise<Record<string, number>> {
  const entry = path.join(EXPERIENCES, 'src/host/index.js')
  if (!fs.existsSync(entry)) return {}
  fs.rmSync(AIXC_OUT, { recursive: true, force: true })
  const r = await esbuild.build({
    bundle: true, format: 'esm', splitting: true, platform: 'browser', target: 'es2022', minify,
    charset: 'utf8', sourcemap: true, legalComments: 'linked', logLevel: 'warning',
    entryPoints: { aixc: entry }, outdir: AIXC_OUT, entryNames: '[name]', chunkNames: '[name]-[hash]',
    loader: { '.css': 'text', '.svg': 'dataurl' }, metafile: true, plugins: [aixcAssets],
  })
  // write AIXC_OUT/manifest.json from r.metafile.outputs (file -> entryPoint/imports) for the size test
}
```
- Call it inside the Promise.all at 90, and merge `aixc/<file>` sizes into the return value.
- splitting needs outdir and format esm; the IIFE `common` (75-89) cannot be reused as is.
- `aixcAssets` is an onLoad plugin for experiences/src/**/*.js. It rewrites `new URL('<rel>.css'|'<rel>.svg', import.meta.url).href` into an injected import: CSS as text, then a data: URL or a <style> via the planned src/host/styles.js; SVG as a data URL.
- This keeps the modules runnable unbundled. The clone is served raw by demo-browser.ts:228-237 and scripts/serve.mjs until phase 9, so plain `import x from './a.css'` would break the replay e2e tests.
- Core CSS that index.html links today (lines 19-46) must be imported by the host entry (text) and injected once by styles.js. Chunk CSS travels with its chunk.
- Optionally minify CSS with esbuild.transform({ loader: 'css', minify: true }) inside the plugin. cssMinify (42-61) only covers packages/sdk/src.
- import.meta.env (aixc/controller.js:31) is harmless in ESM.

In voice-guide/services/gateway/server.ts, after line 93:
```ts
router.on('GET', '/sdk/aixc/:file', (_req, res, p) => {
  if (!/^[\w.-]+\.js(\.map)?$/.test(p.file)) throw new HttpError(404, 'not found')
  const file = path.join(sdkDir, 'aixc', p.file)
  if (!fs.existsSync(file)) throw new HttpError(404, 'experience layer not built: npm run build:sdk')
  res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': process.env.NODE_ENV === 'production' && /-[A-Z0-9]{8}\.js$/.test(p.file) ? 'public, max-age=31536000, immutable' : (process.env.NODE_ENV === 'production' ? 'public, max-age=300' : 'no-store') })
  res.end(fs.readFileSync(file))
})
```
- The /__vg/** bridge (demo-browser.ts:185-188) and the replay fallback (281) need no change. Dynamic import() resolves chunks relative to /__vg/sdk/aixc/aixc.js.

Size test (voice-guide/tests/unit/sdk-size.test.ts):
- Add `const AIXC_BUDGETS = { 'aixc.js': <measured + margin> }`.
- Add a test that reads dist/aixc/manifest.json, checks the core budget and one budget per chunk, and asserts the core lacks demo markers (for example /pocket-journey-|aixc-magazine|pz-world|tips-coach/), as in lines 39-41.
- t.skip while the entry is absent.

Site config:
- Add to voice-guide/services/shared/config.ts after line 224:
  `experiences: z.object({ enabled: z.boolean().default(false), paths: z.array(z.string()).default([]), demos: z.object({ pocket: z.boolean().default(true), reimagine: z.boolean().default(true), journey: z.boolean().default(true), redWorld: z.boolean().default(true), tips: z.boolean().default(true), watch: z.boolean().default(false), demoKit: z.boolean().default(true) }).default({...}) }).default({...})`
- yaml: `experiences: { enabled: true, paths: ['^/(en|ar)/'], demos: {...} }`.
- Add a unit assertion beside tests/unit/trail.test.ts:241, because zod strips unknown keys silently.

(3) TRAIL HOST V2: ONE VERSION FOR ASKED, CLAIM, SEED AND RESET

host.ts:
- `version: 2`, with a changelog in the header comment.
- New types: `AskedQuestion { id; at; lang; origin: 'voice'|'typed'|'chip'|'host'; destinationId; pageId?; intent; route; label? }` and `TrailSeed { kit: { id: string; capturedAt: number; source: I18n }; steps: TrailStepSummary[]; chunks: ReplayChunk[]; interest: ElementInterest[] }`.
- Snapshot gains `asked: (AskedQuestion & { stepId: string; pageTitle: I18n })[]` and `seed?: { capturedAt: number; source: I18n }`.
- API gains `askAbout(destinationId, questionId?)`, `questionsFor(destinationId)`, `claim(): () => void`, `seed(s: TrailSeed): Promise<{ ok: true; steps: number } | { ok: false; reason: 'consent'|'not-allowed'|'invalid'|'storage' }>`, and `resetConsent(): Promise<void>`.

types.ts:
- TrailStepSummary.asked? (at most 10), TrailStepSummary.seeded?: true, TrailSession.seed?.
- parseSession (151-157) maps each step's asked through an isAsked filter and keeps the step.
- No IndexedDB version bump (config.ts:37).

storage.ts:
- `async putJourney(s: TrailSession, chunks: ReplayChunk[], interest: (ElementInterest & { sessionId: string })[]): Promise<void>`: one readwrite transaction over sessions, chunks and interest, modelled on deleteSession (209-218), so a seed is all or nothing.

consent.ts:
- `clearConsent(siteKey)` removes consentKey. resetConsent() calls #clear(true), then clearConsent, then dispatches TURN_OFF or START.

controller.ts, recording asked questions:
- In start() (149), wrap g.request to note the origin with a per-call token, and g.api.post to capture `/v1/turn` responses (guide.ts:270).
- Record only if state.rec === 'recording', the target step is a page, and plan.meta.destinationId exists. The target step is hint.trailStepId for chips, else this.step.
- Push an AskedQuestion and call #writeIndex(false). Never store the utterance or plan.say. Undo the wrappers in destroy (1129).

controller.ts, snapshot and API:
- #snapshot (527) strips asked from steps.
- hostApi.ask (566) adds the `sel.questions[lang] || sel.questions[lang.slice(0,2)]` fallback.

controller.ts, seed():
1. Allowed only if this.settings.seed is true. It is server-sent and demo-only: add it to TrailSettings (38-49), trailSettings (server.ts:26-29) and the trail zod schema, and set it in demo-live like line 92.
2. Requires state.consent === 'granted'. Otherwise it dispatches OFFER, so the guide's own card asks, and returns 'consent'. The demo kit must never call allow() itself (state this rule in the ADR).
3. Validate with isStep, isChunk, decodeChunk and isEvent; same-origin canonicalPath; total bytes at most maxBytes; at most maxSteps.
4. Rebase step, session and chunk times to now. Set expiresAt = now + retentionHours. New step ids via rid('stp'), chunk ids `${stepId}:${seq}` as at 845, step.bytes, seeded: true.
5. Run #flush(), await #writing, then `this.session ??= await #currentSession(now)`. Insert the seeded steps before the current step, roll off beyond maxSteps as at 666-669, and add to session.bytes.
6. Chain store.putJourney into #writing, then #writeIndex(true) and #render().

Why seed() must be a controller method rather than direct puts:
- The timeline reads only this.session (518).
- #writeIndex overwrites the session by id (929).
- #currentSession (616) and planEviction (storage.ts:33) discard stale sessions.

Server side of v2:
- packages/kb/src/plan.ts:57-62 meta gets pageId? and label?.
- services/router/planner.ts:34 sets them.
- packages/kb/src/experience.ts:119 provides the price check for the label.
- trail/i18n.ts:17-18 copy, and trail.e2e.test.ts:160.

In the clone, journey.js:503 accepts version >= 1.

All of this lives in trail.js (27,144 of 30,720 bytes gzipped measured), with guide.js untouched.

(4) EVERY REFERENCE TO vodafone-services-clone BY PATH

Code to change at `git mv`:
- voice-guide/tools/demo-live.ts:163 (cloneMount default) and :13 (comment)
- voice-guide/tests/e2e/vodafone-pocket.ts:24 (CLONE)
- voice-guide/tools/demo-walkthrough.ts:68
- voice-guide/tools/journey-shots.ts:50
- voice-guide/tests/e2e/pocket-journey.e2e.test.ts:4 (comment)
- vodafone-services-clone/package.json:2 and package-lock.json (the `name` field; optional)

CI:
- .github/workflows/voice-guide.yml has no path to rename. Add 'experiences/**' to line 7.

Tracked docs:
- README.md:5
- voice-guide/AGENTS.md:95
- experiments/page-agent/README.md:12
- experiments/text-to-speech/README.md:16
- experiments/voicetut/README.md:3,12
- voice-guide/docs/adr/0026:20, 0029:15, 0040:13,20, 0043:15,25,30, 0044:21, 0045:5,42,43, 0046:10, 0047:5,26
- voice-guide/docs/handoff/HANDOFF.md:125
- voice-guide/docs/pilot-tuning.md:141
- voice-guide/docs/prompts/vodafone-live-demo.prompt.md:29
- voice-guide/docs/qa/bug-log.md:196,203
- voice-guide/docs/qa/bugs-and-open-issues.md:42
- voice-guide/docs/reference/vodafone-live-site-audit.md:6,72
- voice-guide/docs/specs/SPEC-01:6,64, SPEC-03:19,51, SPEC-06:62
- voice-guide/docs/tasks/TASKS.md:35,47,120,251
- docs/wiki/Your RED world (demo 5).md:12,13 (wiki `paths:` frontmatter) and :15

Untracked:
- docs/handoff/Handoff all five demos live on Vodafone's real pages (Way 2).txt:20,21,39,57,96,136,276,373
- docs/wiki/Demo 5 revamp - personalization for an anonymous visitor.txt:5

Leave alone:
- .claude/launch.json:7,12,13 (local, per plan)
- .worktrees/*
- Claude outputs/*
- The ADR-0043 filename '0043-arabic-services-clone-...' (it matches 'services-clone' but is not the folder; links at docs/adr/README.md:48 and 0040:3 stay).

Clone-internal: only README.md:332 points back at ../voice-guide (unaffected).

## 2. The demos' modules and what they need from a live page

### Plan and code disagree

- Plan section 2 lists four hard-coded clone selectors. src/ has more: main.js:13 '#app' and :14 body[data-page]; shared.js:255 '#site-header' (the plan cites only :256 '#aixc-viewbar'); pocket.js:185 '.page-shell'; pocket.js:860-862 '.pocket-output' and `.${classList[0]}`; tips/entry.js:86 '.voicetut-demo'; the shell sprite ids used by svgIcon/<use> (dom.js:58, components.js:31-38, art.js:26, tips/icons.js:61); CSS aixc.css:43-44 (.source-content, .experience-output) and pocket.css:256-283 ('#experience-output'); and clone ids as data in main.js:20-27, pocket.js:39, coach.js:94, tips/scenes.js (many) and tips.js:41-45.
- Plan section 2 says the stickers keep title, copy, image and link in aixc.pocket.v1. The code stores only a string[] of ids (pocket.js:172-179, 203-209) and draws each sticker from the current page's catalog (pocket.js:678-679). Ids not on the current page are dropped at load (pocket.js:194) and the next persist() writes the shortened list, so plan 3.5's 'Stickers from any page share one Pocket' cannot work without a new stored shape.
- Plan 3.4 makes the section id the portlet instance id (w9Jro8TDb1vH) and the item id 'slug of the link's path (plus #hash)'. content-index.js:15 accepts only /^[a-z0-9][a-z0-9-]{0,63}$/, so mixed-case ids and '#' are dropped by normalizeContentModel (40-43, 48-50). dom.js:85-90 slug() turns Arabic titles into 'x', so title-slug fallback ids clash on Arabic pages.
- Plan 3.3 sets main = sourceRoot = #main-content. The modules assume main contains sourceRoot, outputRoot and viewbar (shell.js:264-268). pocket.js:271 appends the album into main, and pocket.js:793-815 hides sourceRoot on open, so on live the album would be hidden inside #main-content. controller.js:323 measures main's top while main is hidden.
- Plan 3.3 says content inside #main-content is only tagged or hidden. Pocket's decorate() appends a liner and button into every card and adds classes (pocket.js:650, 667-668), liftCorner appends a curl host into the card (431), and pocket.css:52 and 181-187 restyle the card (position:relative; transparent !important).
- The plan's rules (section 0: never hide, cover, move or restyle Vodafone's accessibility button; 3.7: 'Never moved') conflict with pocket.css:287-294, which transitions #vodafone-aw-icon and sets bottom:calc(20px + 230px|150px) !important and z-index:10 !important when the corner peeks or a reimagined view shows. Plan 3.7 also says 'the right-hand column lifts (ADR-0044's 230/150 px)', so the plan contradicts itself.
- Plan 3.3 names the output #aixc-output. pocket.css:256-283 keys the reimagined-view tuck-in on #experience-output, aixc.css:44 on .experience-output[hidden], and pocket.js:862 expects a class on each covered region.
- Plan 3.5 / 3.4 expect live re-extraction (a MutationObserver re-runs extraction) to feed the demos. Every consumer reads the model once at init: controller.js:69-74, pocket.js:186-191 and 672-675, tips/entry.js:69. There is no update API.
- Plan 3.4 gives `extractContent()` with no argument returning { model, problems, coverage }. The modules call `adapter.extractContent(sourceRoot)` (controller.js:69, pocket.js:186, tips/entry.js:69) and the clone contract in page-adapters.js:6-14 has no coverage field. This is compatible only if the argument is ignored and the result memoized.
- Plan 1 and 3.3 list what the shell provides as header, #source-content, #experience-output and #aixc-viewbar. shell.js also provides the SVG sprite (shell.js:134-180), which experiences, RED world and Tips reference. The plan does not mention it.
- Plan section 2 'Not verified: the live header element'. From the saved 2026-10-23 replay (not live): 13 of 14 pages have header#header containing nav.nav-switcher and nav#nav-header; footer.footer with no id; div#main-content.columns-1[role=main] inside section#content inside div#wrapper. The SPA page /spa/storeLocator (f17e23613c.html.gz) has none of these. The saved theme CSS has `.nav-header.nav-fixed{position:fixed;top:0;z-index:20}`, unlike the clone's sticky .site-header (style.css:155-158). #vodafone-aw-icon is absent from all saved HTML, so a script injects it at runtime.
- Plan 3.5 (Pocket 'with its actors and the portal'). The portal is not on feature/live-way2: no file under src/pocket/portal exists here. It is on feature/pocket-portal (f5ac819) and adds initPocket({ …, portal }) (pocket.js:184 there), html[data-vf-portal] (portal/controller.js:152, 436), a body append (153), history.replaceState with key 'vfPortal' (portal/history.js:12-28), a portal.css <link> via import.meta.url (portal/portal.js:42-46), window.__vfPortal (157) and __vfPortalTrace (controller.js:354), and a click interceptor (interceptor.js:85). feature/pocket-actors-live (e015045) adds pocket-cursor.js/.css and rewrites pocket-actors.js (+1995/−… lines). Line numbers in this map are for HEAD and shift after phase 0.
- Plan 3.5 / D4 propose the RED world in Arabic. personalization/index.js:61 returns null for lang!=='en', and ar/index.html omits extension.css and status-widget.css.
- Plan 3.9 says nothing new leaves the browser. The composer's Gemini path posts the page payload from the page to generativelanguage.googleapis.com (gemini-client.js:13, 182), with the API key in localStorage aixc.gemini.v1 (controller.js:24-62), which on live is Vodafone's origin. index.html:15-17 loads Google Fonts (Roboto 900) for streaming; the plan says to ship no fonts.
- Plan section 2 says the pocket finds cards at pocket.js:672 (correct), journey at :56 (correct), coach at :93 (correct) and voicetut/demo at :246 (correct).

### Risks

- Writes outside main/sourceRoot/outputRoot/viewbar (full list). document.body.append: controller.js:229 (launcher, composer, live region); pocket.js:272 (plane and lift layers, peek button, live region), 478 and 746 (flying sticker hosts); tips/entry.js:82 (button) and 158 (invite); tips/tips.js:133; tips/coach.js:261; personalization/index.js:67; status-widget.js:95; extension.js:193; world.js:43 and 59; voicetut/demo.js:53; page-agent-demo.js:9 and 70. Body data attributes: aixcView (controller.js:317), pocketView (pocket.js:820, 891), pocketActorReady (pocket-actors.js:985, 1075), pzDialog (world.js:63, 84). <html>: dataset.vgTrail (main.js:54), style --aixc-header-h and --aixc-viewbar-h (controller.js:234-236), style.overflowAnchor (extension.js:350 and six other sites), classList tips-open (tips.js:495, 550), on the portal branch dataset.vfPortal. <head>: <link> appends at tips/entry.js:53, personalization/index.js:47 and voicetut-loader.js:13. Sibling of viewbar: p.aixc-viewnote (controller.js:225). Inside Vodafone cards: pocket.js:431, 650 and 667. Inside the album: pocket-actors.js:141, extension.js:189, journey.js:79, 87 and 152. Window scroll: pocket.js:821 and 893, controller.js:324, extension.js glideTo. History (portal branch): history.replaceState. Nothing writes to the header or footer (read-only everywhere; the footer is cloned at extension.js:277).
- Only some added nodes carry data-vg (main.js:52, journey.js:74/86/138, tips/entry.js:79/151, tips.js:91, coach.js:214, personalization/index.js:66/79/96, world.js:42/58). Pocket layers, chips, liners, curl hosts, the composer live region, the viewnote and extension.js:193's explore button do not, and no node carries data-aixc. On live the trail would record them, and failure isolation (remove [data-aixc]) would miss them.
- Global listeners and observers on a busy live page: MutationObserver(document.body, childList) at tips/entry.js:93 (OneTrust and Tealium churn); document keydown capture (extension.js:840); document pointerdown capture (status-widget.js:204); window resize (pocket.js:921, journey.js:500, tips/entry.js:92); a selectionchange listener (voicetut/demo.js:76). Failure isolation must remove these too.
- Owl Carousel clones copy data-aixc-item. pocket.js:672 would decorate the clones and cards.set(id, card) (669) would keep the last one. The adapter's MutationObserver on #main-content would also fire on the Pocket's own decorations and curl hosts, which could loop unless [data-aixc] subtrees are ignored.
- Page-turn snapshot (pocket.js:307-328) clones the whole page frame. On live that is Vodafone's #wrapper (header, nav, footer), and if it reaches body: iframes (OneTrust, Tealium), vg-guide and the layer's own fixed nodes. Cloned iframes and lazy images (forced eager at 322) refetch. stripIds is low risk for styling: the saved theme CSS does not select #header, #wrapper or #main-content (its top id selectors are colours and #sustainability-*).
- Stacking: pocket layers z 6-8 (pocket.css:19-47), peek and liner z ≤ 10, viewbar z 9 (aixc.css:540). Vodafone's nav.nav-fixed is z 20 and the OneTrust filter is 2147483645, and Tips coach uses 2147483500. Pocket layers may fall behind positioned Vodafone content.
- CSS environment: on live, the modules lose style.css's resets (box-sizing 58, img block 75, a inherit 80, button font 85) and its .container (146). Vodafone's Bootstrap .container (padding 15px, max-width 540/720/…) applies to pocket.js:255/264 and journey.js:86/141 instead. Light-DOM UI (buttons, h1-h3, ul, figure, dialog, details) inherits Vodafone's global rules. Module CSS also adds :root custom properties (aixc.css:7, extension.css:11) and body:has() selectors (pocket.css:240-294, status-widget.css:519), whose cost on large live DOMs is unmeasured.
- The hidden attribute on #main-content may be defeated by a Vodafone display rule, because aixc.css:37-46 only forces display:none for clone classes.
- Tips depends on guide internals: vg-guide shadowRoot .tr-card (tips/entry.js:60), .vg-mic and .tr-pill (coach.js:36-38). A guide.js UI change breaks Tips quietly.
- English-only and Services-specific copy: pocket.js:236, 238, 712; tips/catalog.js:31 and FEATURES (four demos, :14); tips/entry.js:148; tips.js:41-45; the personalization strings (index.js:55-56 and others).
- pocket.js:687 reads item.image.src without a guard. A live card without an image throws when the album renders.
- esbuild specifics: `new URL(…, import.meta.url)` is not rewritten (pocket-actors.js:46-47, tips/entry.js:42, personalization/index.js:38, portal.js:42 on its branch). `import.meta.env` (controller.js:31) should get a `define` to avoid build warnings.
- localStorage on live belongs to web.vodafone.com.eg, shared with Vodafone's scripts. Keys written there: aixc.pocket.v1, aixc.tips.v1, aixc.pz.v1, and aixc.gemini.v1 (an API key). Clone data on localhost does not carry over (different origin), so the id change needs no migration.
- Header choice: if regions.header is #header (scrolls) rather than the fixed nav, every Math.max(0, header.bottom) computation collapses to 0 after scroll (pocket.js:284, extension.js:196). If it is #nav-header, its geometry changes when .nav-fixed toggles.

### Open questions

- Should the Pocket still lift Vodafone's accessibility button (pocket.css:287-294, ADR-0044's 230/150 px)? The plan's rule and 3.7 say never move it.
- Which element is PageHost.header for geometry: header#header, which scrolls, or nav#nav-header, which becomes position:fixed with .nav-fixed? Or should PageHost expose chromeBottom() and leave header only as a protected node?
- Where should the album mount on live (pocket.js:271), given that main === sourceRoot? And what is the curl's pageFrame: #wrapper, as on 13/14 saved pages, with the layer, guide, OneTrust and iframes stripped?
- Item and section id scheme under ID_PATTERN (content-index.js:15): lower-case and prefix portlet ids, or widen the pattern? How should '#hash' and Arabic-only titles be slugged?
- The Pocket v2 storage record: which fields are saved per sticker (title, description, image, cta, section title, page URL and title, savedAt)? Does it replace aixc.pocket.v1 or sit beside it?
- Does the Gemini composer path (direct browser call, key stored in Vodafone-origin localStorage) stay enabled on live pages, or is it templates-only there?
- Does the RED world open in Arabic (D4)? personalization/index.js:61 currently blocks it, and its copy is English-only.
- Do the portal (feature/pocket-portal) and actors-live (feature/pocket-actors-live) merges land before experiences/src/host is written? They change initPocket's signature, add history.replaceState, an html data attribute and a click interceptor, and shift every pocket.js line number here.
- Should the layer stay off on SPA pages (/spa/*, no #main-content), or get a different PageHost?

### Design sketch

experiences/src/host/index.js: sketch grounded in vodafone-services-clone/src/main.js:13-63.

1) Boot order and arguments. Wrap each step in guard(name, fn), which logs [AIXC], removes [data-aixc] nodes, un-hides #main-content and drops the tags.
- settings: from the script tag found through import.meta.url (data-aixc-demo, ?aixc=off, ?aixc-debug).
- host = createPageHost(document). It returns null on SPA pages: /spa/storeLocator has no #main-content in the saved replay.
- live = createLiveAdapter({ host, recognisers, pageMap }); extraction = live.extractContent(), memoized.
- adapter = { pageId: live.pageId, label: live.label, renderOriginal() {}, extractContent: () => extraction }. The modules pass sourceRoot; the shim ignores it.
- styles.inject('core', …) and injectSprite(), described below.
- regions = { header: host.header, footer: host.footer, main: host.main, sourceRoot: host.sourceRoot, outputRoot: host.outputRoot, viewbar: host.viewbar }. Also add pocketMount (new, outside #main-content), pageFrame (for the curl snapshot) and chromeBottom() (header geometry). The modules read only header, footer, main, sourceRoot, outputRoot and viewbar today.
- composer = initComposer({ adapter, regions }). It uses sourceRoot (hide, extract), outputRoot (render), viewbar (fills it, sets hidden/role/aria-label, inserts .aixc-viewnote after it), header (height → --aixc-header-h, ResizeObserver) and main (scroll top, controller.js:323). It returns { state }. Then tag .aixc-launcher, .aixc-composer, the live region and .aixc-viewnote with data-vg and data-aixc (main.js:52 does only data-vg). Add window 'vg:trail-ready' → documentElement.dataset.vgTrail = 'on' (main.js:53-55). Keep markReimagined on host.outputRoot (main.js:36-46), with destinations from the adapter's tags.
- pocket = initPocket({ adapter, regions, composer }), plus `portal` after the feature/pocket-portal merge. It uses sourceRoot, outputRoot, viewbar and its next sibling, header, main (album mount and .page-shell lookup), composer.state.view and composer.state.activeExperience.mount/unmount. It returns { state, pocket, putBack, open, close, dock{ root, view, barStart, stage }, openWhenEmpty, destroy }.
- if (pocket) initJourney({ pocket }). It also reads '.site-header' (journey.js:56), window.voiceGuide.trailHost with version === 1, and the events vg:trail-ready (detail = host API) and vg:trail-open. Add a host or chrome getter argument.
- initTips({ adapter, regions, pocket }). It uses only regions.sourceRoot, for extraction. It returns { entryButton, open, load }.
- if (pocket && (lang === 'en' || D4)) initPersonalization({ pocket, regions }). It uses pocket.dock.root, regions.header, regions.footer and ?pz=. It returns { store, extension, widget }.

2) What the live page will not provide (today it comes from shell.js or index.html):
- #app and body[data-page] (main.js:13-14);
- the sticky .site-header#site-header (style.css:155);
- the footer #site-footer (Vodafone's is footer.footer with no id);
- .page-shell (pocket.js:185);
- regions nested inside main (shell.js:264-268);
- the SVG sprite (shell.js:134-180);
- meta[name=vg-trail-host] (index.html:13; the plan moves it to the loader);
- the stylesheet links (index.html:19-46);
- Roboto 900 (index.html:15-17);
- clone fonts and resets (style.css:1-87, rtl.css:9-37);
- .container (style.css:146);
- html lang/dir: Vodafone sets lang=en-US or ar-SA, and i18n.js:9 handles both.

3) CSS inventory and injection. Build with esbuild loader {'.css': 'text'}. A new styles.js exports inject(id, cssText): it appends one `<style data-aixc data-vg data-aixc-style=id>` to head, once per id, and teardown removes them all.
- Core, at boot: aixc/aixc.css (692 lines), pocket/pocket.css (774; contains the #vodafone-aw-icon and #experience-output rules that must change first), tips/entry.css (216); English only: personalization/extension.css (674) and personalization/status-widget.css (674); RTL only: rtl.css lines 38-54 (drop the @font-face blocks at 9-37).
- On intent, with the Reimagine chunk: aixc/experiences/vodafone.css (480; shared .aixc-vx tokens for the group experiences) plus each experience's own file: magazine 1170, streaming 1158, flipbook 651, canvas 594, split 514, tunnel 508, fan 451, spotlight 441, cube 416, ring 398, gallery 362, coverflow 353, journey 271.
- With journey.js: pocket/journey.css (744). With the actors: pocket/pocket-actors.css (303), plus pocket-cursor.css on the actors branch.
- Replacing the existing link loaders: tips/tips.css (1963; tips/entry.js:37-56) and personalization/world.css (3132; personalization/index.js:33-48). Portal branch: pocket/portal/portal.css (portal.js:42-46).
- Not injected: style.css, voicetut/demo.css (retires) and the Google Fonts link.
- injectSprite(): build the symbol string from a shared module rather than importing shell.js, which pulls in the shell markup.

4) Storage. localStorage:
- aixc.pocket.v1: string[] of item ids (pocket.js:24, 174, 205); needs a v2 record shape for cross-page stickers.
- aixc.gemini.v1: { apiKey, model } (controller.js:24, 40, 55, 57).
- aixc.tips.v1: Tips state (tips/catalog.js:10, read through tips/entry.js:27-33).
- aixc.pz.v1: { v:1, profiles:{} } (personalization/store.js:13).
No sessionStorage and no IndexedDB in the clone's src (not found). Portal branch: history.state key 'vfPortal' (portal/history.js:12). The trail's own keys (voice-guide SDK: consent in localStorage through consentKey(siteKey) at consent.ts:20/29, IndexedDB cfg.db at storage.ts:121, sessionStorage SS(siteKey,'open') at controller.ts:585) are outside these modules; their names are not resolved here, but 'Reset demo' needs them.

5) URL switches and globals the host should own or namespace. Switches: ?aixc-debug (controller.js:25, tips/entry.js:177, personalization/index.js:100), ?pz= (store.js:28), ?tips= (catalog.js:172), ?demo=voicetut and ?demo=page-agent / ?agentLang (the loaders; both retire). Globals: window.__aixc (controller.js:615), __aixcTips, __pz, __POCKET_ACTORS_TEST__ (pocket-actors.js:88), voiceGuide.trailHost, navigator.webdriver (tips/entry.js:68).

6) Unit test for the plan's 'no writes outside regions'. Statically scan experiences/src for document.body.*, document.documentElement.*, document.head.* and querySelector('#…|.site-…|.page-shell'), with an allowlist naming each site above. At runtime, a MutationObserver on document records additions outside main, outputRoot, viewbar and the pocket mount that lack data-aixc.


## 3. Phase 1b: VoiceTut speaks for the guide

### Plan and code disagree

- ADR-0047 line 3 points to docs/handoff/live-demos-way2.md, which is deleted in the working tree (git status ' D'). The plan now exists only as the untracked 'docs/handoff/Handoff all five demos live on Vodafone's real pages (Way 2).txt'.
- There is no planner.plan function. The router calls buildPlan (services/router/handlers.ts:131, defined at services/router/planner.ts:29). 'planner.plan' is only the trace event name at handlers.ts:137.
- No services/*/client.ts exists anywhere (not found). Clients are generic Proxies from services/shared/rpc.ts (localClient:28, httpClient:39), bound in services/index.ts:44-47. No service holds another service's client today: RouterDeps (handlers.ts:48-57) has none, and ADR-0009 says 'the gateway reaches a service through a client'. A router-to-speech-out client is a new cross-service dependency, and createRouter is built before bind exists (index.ts:37 versus 44).
- ADR-0009 says each service has services/<name>/main.ts. Only services/gateway/main.ts exists; the others run through services/run-service.ts, which forces services:'local' (line 20).
- The plan's known lines are 'plan.say, step text and message'. The executor also speaks ask.question (executor.ts:189), which the planner's clarify question produces (planner.ts:52).
- The plan's speech.out.mode is Gradio synthesize's second argument `language` (local_api.py:67, 72; demo.js:139). Gradio's own `mode` argument is the constant 'builtin' (local_api.py:68). info lists voices under `speakers[].speaker_name` (local_api.py:55-63).
- VoiceTut accepts only steps in {16,32,48}, speed in {0.85,1.0,1.15} and guidance == 2.0 (local_api.py:76). The plan's knobs are free numbers, and guidance is missing from the plan's cache-key list.
- ADR-0047 Decision 2 puts 'language' in the cache key; plan §3.11 puts 'mode'. VoiceTut only sees mode.
- The plan's YAML sets `engine: voicetut` in config/sites/vodafone-eg.yaml. ADR-0047 Consequences (line 41) says 'system' everywhere except 'the demo profile', and no demo profile exists. The only precedent is a demo:live flag mutating the loaded site (tools/demo-live.ts:90-92).
- Plan §3.11 and ADR-0047 say speech:warm synthesises 'the fixed phrases of packages/sdk/src/i18n.ts'. That file's own header (line 1) says spoken lines come from services/router/phrases.ts, and only 5 i18n keys are ever spoken (planStopped, error, agentUnavailable, watching{label}, watchFailed). 'The answers of the router tuning set' do not exist as data (tests/fixtures/vodafone-utterances.yaml has no answers field); they must be generated with understand+buildPlan, as services/router/eval.ts:42-58 does.
- The '79 bytes left' is the Linux/CI figure (ADR-0041:21, 20,401 bytes, measured 2026-11-05, not 2026-11-10 as plan §2 says). packages/sdk/dist/guide.js on this Mac (built 2026-11-10 17:24) measures 20,284 with Node zlib level 9, about 117 bytes lower, which matches ADR-0041's Mac/Linux gap.
- Plan §3.11 says the halo follows the audio element. Today the speaking state is a CSS ring (launcher.ts:41), and setState() stops the wave for every state except listening (launcher.ts:199), so an audio-driven halo needs startWave() called after setState('speaking').
- Plan §3.11 returns `{ url: '/v1/speech/<hash>.wav' }`, which the page must prefix with its gateway path (<origin>/__vg, packages/sdk/src/index.ts:19-20). An <audio> element cannot send x-vg-site-key, and siteFor requires a key (server.ts:69), so the URL needs `?k=<siteKey>` (precedent: api.ts:69).
- ADR-0047 Decision 1 and plan §3.11 say the VoiceTut endpoint stays out of the repository. The endpoint URL is committed in client.js:3 (MODAL_ENDPOINT), ADR-0047:12, experiments/voicetut/README.md:16 and modal-deployment-status.json. The TypeScript port must not copy MODAL_ENDPOINT.
- README.md:45 gives a 60 s info timeout, but the clone code waits 300 s (demo.js:107).
- The plan says #say 'waits at most 2.5 s before a navigate step'. That is correct (guide.ts:282, 330), but every executor line uses wait:false (executor.ts:156, 160, 181, 189) and is not awaited at all. Speech.speak cancels the previous line (speech.ts:186), so a later line cuts off an earlier one, and voice-out must keep that contract.

### Risks

- VoiceTut's Gradio queue runs one job at a time and holds at most 2 waiting (local_api.py:110). Synthesising a plan's lines ahead with concurrent calls will be rejected. The service needs its own serial queue with page requests ahead of prepare and warm, and dedupe by hash. Even then, a page request can wait behind an ahead job already running (~3 s), which exceeds the 2.5 s budget and forces the fallback. The format of a Gradio 'queue full' error, and whether info and synthesize share the concurrency slot, are unverified.
- A WAV must be downloaded right after `complete`. Gradio cleans its cache (delete_cache=(60, 600), local_api.py:94) and Modal scales down at 60 s (modal_app.py:45).
- The audio host check may fail on Modal. Gradio may build file URLs with another scheme or host behind Modal's proxy, so url.origin would differ from VG_VOICETUT_URL. This is unverified because the app is not deployed. Check it in phase 1b step 1. If only the scheme differs, rebuild the URL on the configured origin from the /gradio_api/file= path instead of loosening the check.
- Cold start. The cache key needs model_version from info, and after a scale-down info takes minutes. Persist the last model_version in data/speech/model.json so a cache hit never waits on info. On a first-ever run without it, every line falls back until speech:warm has run.
- model_version embeds the host ('VoiceTut Modal L4 · b36bdf4', local_api.py:52). Moving between a local and a Modal host invalidates the whole cache even with identical weights.
- An uncached line before a navigation is cut off. #say races 2500 ms before navigate (guide.ts:330), and firstAudioMs is also 2500, so the fallback starts as the page unloads. Mitigation: speech:warm must cover 'taking {page}' and 'closest {page}' for every knowledge-base page title in both languages.
- The headline demo answers (cheapest or largest bundle) are live spotlight reads (planner.ts:172-181, executor.ts:154-156). They cannot be synthesised ahead and take about 3 s warm, so they will almost always fall back to the system voice. Mitigations: a rehearsal run in the same process (memory cache), or accept it. The owner should know before phase 8.
- Privacy (AGENTS.md §4 rules 3 and 4). Live-read text (up to 220 characters, executor.ts:255) and agent lines would go to Modal (outside Egypt) and to disk in data/speech. On signed-in pages they could hold personal data. Proposed handling: lines not registered by prepare or warm are kept in a bounded memory cache only, never written to disk, and their text is never traced. A line that maskContent would change is not sent to VoiceTut at all (system voice instead). The chunk checks before sending and the service checks again, as the agent proxy does.
- Web Audio. createMediaElementSource on a suspended AudioContext silences the element, and it can be called only once per element. Route through the analyser only when ctx.state === 'running' after resume(); otherwise play directly and keep the CSS ring.
- Autoplay. The demo browser sets --autoplay-policy=no-user-gesture-required (demo-browser.ts:139), but a real Chrome profile may reject audio.play() without a gesture on a newly loaded page. Treat NotAllowedError as a fallback reason ('blocked'). speechSynthesis has similar user-activation limits.
- Size. The gate measured +34 bytes in an in-memory splice on the Mac, against 79 bytes of Linux headroom. Linux deltas can differ. If it does not fit, the cheapest savings ADR-0041 already names are ui.ts template whitespace (~23 bytes) and moving #runAgent/#resumeAgent (guide.ts:591-628) into agent.js. Moving Speech.speak into the chunk is not recommended: it is the fallback when the chunk fails, and engine=system sites would need the chunk just to speak.
- The JSON-only service seam: localClient (rpc.ts:29) stringifies and parses everything, so WAV bytes cross as base64 (~33% larger, two JSON passes in process). At 24 kHz mono 16-bit, a 3 s sentence is about 144 KB raw and about 192 KB as base64. The sample format VoiceTut writes is unverified.
- httpClient times out at rpcTimeoutMs = 4000 (rpc.ts:51, config.ts:62). speak() must return within its wait (firstAudioMs) and never block on a cold info. Clamp waitMs to below rpcTimeoutMs minus 500.
- Scaled mode: a router process built by run-service.ts gets a local speech-out with its own cache and keep-warm loop unless VG_SPEECH_OUT_URL is honoured for that binding.
- Existing e2e suites load vodafone-eg.yaml and assert on __spoken (tests/e2e/live-replay.e2e.test.ts, guide.e2e.test.ts). The effective engine must be decided with VG_VOICETUT_URL in /v1/session, or setting engine: voicetut in YAML will break them.
- The existing barge-in e2e test (live-replay.e2e.test.ts:348-363) measures __cancelledAt, which the speechSynthesis.cancel stub sets. voice-out's cancel() must still call the original cancelSpeech so this stays green, and must clear its firstAudioMs timer and invalidate late replies, or the fallback will speak while the guide listens.
- Sentence splitting must match on both sides. If the router's ahead path and the page split or canonicalise differently, prepared audio never hits the cache. One module must serve both.
- Cost. Keep-warm runs info every 45 s while a session is active, and info itself occupies Gradio's queue. Skip it while a job runs or ran within the interval. The owner sets the Modal spending limit (D8). CC-BY-NC weights keep this to the owner's demos.

### Open questions

- Default engine in config/sites/vodafone-eg.yaml: 'system' with `npm run demo:live -- --voice voicetut` (ADR-0047 Consequences), or 'voicetut' as the plan's YAML shows? Either way, the effective engine also needs VG_VOICETUT_URL.
- Live-value and agent lines: should they go to VoiceTut at all? The proposal is yes, but kept in a memory cache only, never on disk, never with their text traced, and kept local (system voice) when masking would change them. This refines ADR-0047's 'cache on disk' and may need its own ADR (AGENTS.md: a changed decision gets a new ADR).
- Who calls prepare: the router through a speech-out client (the owner's wording in commit 3b6a823, and a new service-to-service dependency under ADR-0009), or the gateway after s.router.turn (server.ts:135), which keeps the gateway as the only orchestrator?
- WAV transport: base64 through the speech-out client (keeps ADR-0009's 'nothing shared but the store'), or the gateway reading a shared dataDir (faster, but it reaches into the service's internals)?
- What counts as 'a demo session is active' for keep-warm: any /v1/session, turn or speech in the last N minutes (proposed knob keepWarmIdleMinutes = 10)?
- Should the speak row or traces include the spoken text for lines that are already traced elsewhere (plan.say in planner.plan), or never? The proposal is never; the row shows only counts and hash prefixes.
- Chunk name: keep 'voice-out.js' (global window['__vgVoice-out'] via #chunk) or rename it to 'voiceout.js' for a clean identifier?
- Is guidance (fixed at 2.0) worth a knob? VoiceTut rejects any other value (local_api.py:76), so it is a key component but not a setting.
- How does Gradio report 'queue full' through the /call API, and do the info and synthesize events share one concurrency slot? To verify on the deployed app before tuning keep-warm.
- Does Gradio behind Modal return file URLs on the same origin as the configured endpoint? To verify in phase 1b step 1.

### Design sketch

SERVICE: services/speech-out/ (one handler map, ADR-0009). Every file starts with a header comment citing ADR-0047. Tabs, single quotes, no semicolons, imports with .ts.

1. services/speech-out/voicetut.ts: TypeScript port of vodafone-services-clone/src/voicetut/client.js, with no MODAL_ENDPOINT and no default SPACE.
   - `export function voiceTutBase(raw: string): string`: HTTPS, or HTTP on loopback only; no path, credentials, query or hash.
   - `export function parseEvent(block: string): { event?: string; data: string }`
   - `export async function readResult(body: ReadableStream<Uint8Array>): Promise<unknown>`: same semantics as client.js:29-63 (heartbeat ignored, `error` throws with the message, `complete` returns JSON, early close throws).
   - `export function audioUrl(file: unknown, base: string): string`: same-origin check.
   - `export interface VoiceTutInfo { mock: boolean; model_version: string; package_version?: string; sampling_rate: number; speakers: { speaker_id: unknown; speaker_name: string; arabic_name: string; gender: string }[] }`
   - `export interface SynthesisRequest { text: string; mode: 'arz' | 'en'; voice: string; steps: 16 | 32 | 48; speed: 0.85 | 1 | 1.15; normalize: boolean }`
   - `export class VoiceTut { constructor(o: { base: string; fetchImpl?: typeof fetch; infoTimeoutMs: number; synthTimeoutMs: number }); info(signal?): Promise<VoiceTutInfo>; synthesize(r: SynthesisRequest, signal?): Promise<{ wav: Buffer; audioSeconds: number; generationSeconds: number; ms: number }> }`
   - synthesize sends `data = [r.text, r.mode, 'builtin', r.voice, null, '', r.steps, 2.0, r.speed, r.normalize]`.
   - info rejects `mock: true` or an empty speakers list.
   - The WAV is downloaded at once with fetchImpl(audioUrl(file, base)), then checked: 'RIFF' at 0, 'WAVE' at 8, size at most 8 MB.
   - Calls are POST /gradio_api/call/{info|synthesize} → event_id (regex ^[\w-]+$) → GET /gradio_api/call/{endpoint}/{event_id}.

2. packages/sdk/src/voice/sentences.ts: shared by the SDK chunk and the service. Precedent: agent/handlers.ts:13 imports from the SDK.
   - `export function canonicalSpeech(text: string): string`: NFC, collapse whitespace, trim.
   - `export function splitSentences(text: string, max = 1500): string[]`
   - Split after . ! ? ؟ … or a newline when followed by whitespace, so 1.5 GB and EGP 1,250.50 stay whole.
   - Merge fragments under ~12 characters into the neighbour. Hard-cap at max by splitting on ، or , then on space. Order is kept.

3. services/speech-out/cache.ts
   - `export const KEY_VERSION = 1`
   - `export function speechKey(k: { engine: 'voicetut'; modelVersion: string; voice: string; mode: string; steps: number; speed: number; normalize: boolean; guidance: 2; text: string }): string`: sha256 hex of JSON.stringify([KEY_VERSION, engine, modelVersion, voice, mode, steps, speed, normalize, guidance, canonicalSpeech(text)]). The key leaves out lang (mode covers it) and leaves out the endpoint.
   - `export class SpeechCache { constructor(dir: string, o?: { memoryMax?: number /* e.g. 200 entries */ }); has(hash): boolean; read(hash): Buffer | null; write(hash, wav: Buffer, meta: { chars: number; mode: string; voice: string; modelVersion: string; ms: number; audioSeconds: number; at: string }, persist: boolean): void; modelVersion(): string | null; setModelVersion(v: string): void }`
   - Disk writes are atomic (tmp then rename) to <dataDir>/speech/<hash>.wav, with a <hash>.json meta file that never contains the text.
   - persist=false keeps the entry in the memory LRU only. That is for lines not registered by prepare or warm (live values, agent lines).
   - model.json holds the last model_version.

4. services/speech-out/queue.ts
   - `export class SynthQueue { constructor(run: (job) => Promise<void>); enqueue(hash, job, lane: 'now' | 'ahead' | 'warm'): Promise<void>; get busy(): boolean; get size(): number; drain(): Promise<void>; close(): void }`
   - One worker (VoiceTut runs one job, queue max 2).
   - Lanes are served now before ahead before warm. Dedupe with an in-flight Map<hash, Promise>. A 'now' request for a hash already queued in 'ahead' promotes it.

5. services/speech-out/warm.ts
   - `export class KeepWarm { constructor(o: { everyMs: number; idleMs: number; tick: () => Promise<void>; isBusy: () => boolean; lastJobAt: () => number; now?: () => number }); touch(): void; close(): void }`
   - Uses setInterval(...).unref(). Calls info only if touched within idleMs, the queue is not busy, and no job ran within everyMs.
   - `export function fixedLines(kb: KbIndex, lang: string): string[]`, built from phrases.ts:
     - fixed keys: here, notFound, unknownPage, agent, whichItem, watchWhich, commit, stopped, nothingToRepeat, help, signIn;
     - taking and closest for every page title, pageTitleOnly per page;
     - the spoken i18n keys: planStopped, error, agentUnavailable, watchFailed.
   - tools/speech-warm.ts also runs understand+buildPlan over tests/fixtures/vodafone-utterances.yaml and -heldout.yaml (the eval.ts:42-58 approach, with buildKbIndex from config/kb/<site>.manifest.json) and collects knownLines(plan).

6. services/speech-out/handlers.ts
   - `export interface SpeechOutDeps { platform: PlatformConfig; sites: Map<string, SiteConfig>; tracer: Tracer; fetchImpl?: typeof fetch; now?: () => number }`
   - `export function knownLines(plan: Plan): string[]`
   - `export function createSpeechOut(deps)` returns:
     - `prepare({ siteId, lang, lines }, ctx) → { queued, cached, skipped }`
       - Returns at once.
       - Splits each line, registers the hashes as known (persist), and enqueues in the 'ahead' lane: the first sentence of the first line first, then the first sentence of each other line, then the rest.
       - Traces 'speech.prepare'.
       - Skips everything when the site engine is not voicetut or VG_VOICETUT_URL is unset.
     - `speak({ siteId, lang, text, waitMs? }, ctx) → { engine: 'voicetut'; hash: string | null; ready: boolean; cached: boolean; ms: number; reason?: 'budget' | 'error' | 'private' | 'off' | 'no-model-version' }`
       - A cache hit returns ready immediately and never calls VoiceTut or info.
       - Otherwise it enqueues in the 'now' lane and awaits min(waitMs ?? firstAudioMs - 150, rpcTimeoutMs - 500). On timeout it returns ready:false while the job continues and caches.
       - Text that maskContent changes returns reason 'private' without any VoiceTut call.
       - Traces 'speech.synth' with { i, chars, cached, ms, queueMs, error } and no text.
     - `audio({ hash }) → { base64 } | { missing: true }`
     - `touch({ siteId }) → { ok: true }`
     - `status({}) → { configured, modelVersion, queue, busy, lastError }`
     - `close()`
   - Voice, mode, steps, speed and normalize come from site.speech.out (voice[lang], mode[lang]).
   - The model version comes from the cache, refreshed by info on the keep-warm tick or before the first synth.
   - `export type SpeechOutHandlers = ReturnType<typeof createSpeechOut>`. No client.ts is needed: clients are generic, rpc.ts Client<SpeechOutHandlers>. If the plan's file name is wanted, client.ts is just `export type SpeechOutClient = Client<SpeechOutHandlers>`.

ROUTES (services/gateway/server.ts)
- POST /v1/speech
  - Body: { sessionId, text, lang }.
  - The gateway resolves turnId as session.turns.at(-1)?.id, so the chunk never needs the private #lastTurnId.
  - Response: { url: '/v1/speech/<hash>.wav' | null, engine, ready, cached, ms, turnId, reason }.
- GET /v1/speech/:file
  - Requires `^[a-f0-9]{64}\.wav$` and ?k=.
  - Serves audio/wav, private, immutable, from speechOut.audio.
- The effective engine is decided in /v1/session: the YAML engine AND VG_VOICETUT_URL, like agentOn.

ROUTER: fire-and-forget prepare after handlers.ts:137 through deps.speech (the owner's choice in commit 3b6a823). The alternative that avoids a new service-to-service dependency is the same call in the gateway after server.ts:135.

STAND-IN: tests/helpers/mock-voicetut.ts, written like mock-vision.ts.
- `export interface MockVoiceTut { url: string; calls: { endpoint: 'info' | 'synthesize'; data: unknown[]; bodyKeys: string[] }[]; delayMs: number; failNext: number; mock: boolean; modelVersion: string; audioOrigin?: string; maxQueue: number; inFlightMax: number; close(): Promise<void> }`
- `export async function startMockVoiceTut(o?: Partial<...>): Promise<MockVoiceTut>`
- POST /gradio_api/call/{info|synthesize} validates exactly as local_api.py:68-77 does and returns { event_id }.
- GET /gradio_api/call/{ep}/{id} streams SSE:
  - first `event: heartbeat\ndata: null\n\n`;
  - after delayMs, `event: complete\ndata: [{"path":"/tmp/x.wav","url":"<origin>/gradio_api/file=/tmp/x.wav"},{"audio":0.5,"generation_seconds":0.1}]` (or an `event: error` with a string);
  - info completes with [{ mock, model_version, sampling_rate: 24000, speakers: [{ speaker_id, speaker_name: 'Mohammed', arabic_name, gender }, { ... 'Yasmin' }] }].
- GET /gradio_api/file=... serves a small RIFF/WAVE built in memory (header code from tests/e2e/browser.ts:153).
- It records inFlightMax to prove the client serialises.

SDK CHUNK: voice-out.js
- Files:
  - packages/sdk/src/voice-out-chunk.ts: entry; `(window as any)['__vgVoice-out'] = { start }`.
  - packages/sdk/src/voice/out.ts: pure logic, unit-testable in Node.
  - packages/sdk/src/voice/sentences.ts: shared splitter.
- out.ts interfaces:
  - `export interface SpeechReply { url: string | null; ready: boolean; cached: boolean; ms: number; turnId?: string; reason?: string }`
  - `export interface Player { play(url: string): Promise<void> /* resolves on ended; rejects on error or NotAllowedError */; stop(): void; prefetch(url: string): void; readonly playing: boolean }`
  - `export interface VoiceOutDeps { request(text: string, lang: string): Promise<SpeechReply>; player: Player; fallback: { speak(text: string, tag: string): Promise<void>; cancel(): void; readonly speaking: boolean }; firstAudioMs: number; report(turnId: string | undefined, attrs: Record<string, unknown>, ms?: number): void; timers?: { set: typeof setTimeout; clear: typeof clearTimeout; now(): number } }`
  - `export class VoiceOut { speak(text: string, tag: string): Promise<void>; cancel(): void; get speaking(): boolean }`
- speak():
  - Cancels first (same contract as Speech.speak), bumps a generation token, splits the text, and fires a request per sentence in order.
  - Races sentence 0 against firstAudioMs. If it is not ready, fails, or play() rejects, it calls fallback.speak(rest of the line, tag) once and reports fallback 'budget', 'error', 'blocked' or 'private'.
  - Otherwise it plays the sentences in order. When a later sentence is not ready, it re-requests (dedupe makes this cheap) and waits up to firstAudioMs, else falls back for the remainder.
  - Prefetches the next URL.
  - Any continuation with a stale generation is dropped.
  - Resolves when the last sentence ends or the line falls back. A duration cap mirrors speech.ts:193.
- cancel(): increments the generation, clears timers, player.stop() (pause, remove src, load()), fallback.cancel(). Server jobs are not aborted.
- `start(g)` in the chunk entry:
  - `const sys = g.speech; const fb = { speak: sys.speak.bind(sys), cancel: sys.cancelSpeech.bind(sys), get speaking() { return 'speechSynthesis' in window && speechSynthesis.speaking } }`
  - `const vo = new VoiceOut({ request: (text, lang) => g.api.post('/v1/speech', { sessionId: g.session.sessionId, text, lang }), player: new AudioPlayer(...), fallback: fb, firstAudioMs: g.session.site.speech.out.firstAudioMs, report: (turnId, attrs, ms) => turnId && void g.api.post('/v1/progress', { sessionId: g.session.sessionId, turnId, cursor: -1, events: [{ name: 'sdk.speak', attrs, ms }] }).catch(() => {}) })`
  - `sys.speak = (t, tag) => (!t || sys.muted ? Promise.resolve() : vo.speak(t, tag))`; `sys.cancelSpeech = () => vo.cancel()`; `Object.defineProperty(sys, 'speaking', { get: () => vo.speaking, configurable: true })`.
  - Each sentence's lang is tag.slice(0, 2). URLs are `${g.o.gateway}${r.url}?k=${encodeURIComponent(g.o.siteKey)}`.
  - The chunk masks with maskContent before sending; if masking changes the text, it uses the system voice.
- AudioPlayer (in the chunk):
  - One reused HTMLAudioElement, not in the DOM, with crossOrigin 'anonymous' when the gateway is cross-origin.
  - On 'playing', if g.ui.voice?.state === 'speaking' and an AudioContext resumed to 'running', it routes createMediaElementSource → AnalyserNode → destination once, then calls voice.startWave(sampler) using levelFromRms and smooth from voice/audio.ts.
  - Otherwise the existing CSS ring shows. During the fetch wait the mic shows the 'speaking' glyph and ring (set by #say at guide.ts:326), as with the system voice.
- guide.js changes:
  - The one awaited gate before guide.ts:179 (about +34 bytes gzip on the Mac splice), plus types.
  - Speech.speak stays in guide.js as the fallback.
  - Payment if Linux does not fit: ui.ts whitespace (~23 bytes), then the agent glue (ADR-0041:33).

X-RAY: server events 'speech.prepare' and 'speech.synth' (per sentence, turn ctx), and the SDK event 'sdk.speak' { engine, cached, firstAudioMs, sentences, fallback } through /v1/progress (sdk.* regex at server.ts:156). These render as 'speak' rows in xray.ts (xray chunk only). The rows never contain text and say 'reply text → VoiceTut (Modal)'.

npm run speech:warm (tools/speech-warm.ts)
- Flags: --site, --lang, --limit, --dry-run.
- Calls info (wake), collects fixedLines plus the tuning-set plan lines, prepares them with persist, awaits drain, and prints counts, cache hits and timings.

TESTS
Unit: tests/unit/speech-out.test.ts
- The four clone tests, ported (chunked complete, error events, interrupted stream, audio host).
- voiceTutBase rules.
- speechKey: changes with each of model version, voice, mode, steps, speed, normalize and text; equal for canonical whitespace and NFC.
- splitSentences: Arabic ؟, decimals, the 1500 cap, order.
- knownLines includes ask.question and excludes spotlight read and caption.
- SpeechCache: atomic write; persist=false leaves nothing on disk; model.json.
- SynthQueue: a 'now' job passes queued 'ahead' jobs; dedupe gives one call; the stand-in's inFlightMax is 1.
- speak cache hit: 0 stand-in calls and no info.
- Slow synth returns ready:false within waitMs, then the line is cached and the next call hits.
- An error event gives reason 'error' and no cache entry.
- Request bodies are exactly { data: [text, mode, 'builtin', voice, null, '', steps, 2, speed, normalize] }, and info sends []. No sessionId, utterance or URL.
- Unknown lines stay off disk. Masked text gives 'private' and 0 calls.
- mock:true is refused.
- KeepWarm with a fake clock: ticks while active, stops after idle, skips while busy.
- SiteConfig accepts speech.out and rejects steps 20 or speed 1.1. The engine defaults to system.
- XrayModel speak rows: a fallback shows as err, with no text.
- VoiceOut with injected fakes: order; fallback at firstAudioMs speaks once; cancel during the wait prevents a later fallback; a late reply after cancel is ignored; muted is silent; NotAllowedError leads to the fallback.
- Router: the injected speech client receives prepare with the known lines; a rejecting or hanging client does not delay or fail turn().
- sdk-size.test.ts additions.

Integration: tests/integration/speech-out.test.ts
- Uses startPlatform with env VG_VOICETUT_URL set to the stand-in, on a unique port.
- /v1/session engine is voicetut only with both the YAML engine and the env var.
- /v1/turn makes the stand-in see synthesize for plan.say before any /v1/speech call, and the trace has speech.prepare and speech.synth on the turn.
- POST /v1/speech then GET url?k= returns audio/wav RIFF bytes; a second POST says cached:true.
- Bad file name, unknown hash, no key and a foreign origin return 404, 404, 401 and 403.
- Over 1500 characters is rejected with 413 or 400, and a burst gets 429.
- Local and HTTP bindings give the same results (rpc.test.ts pattern).
- A ready:false job still completes and caches.

E2E: tests/e2e/voice-out.e2e.test.ts, or an addition to live-replay.e2e.test.ts
- Setup: memory store, demo browser, the stand-in, and the engine flipped on the loaded site as demo-live does.
- voice-out.js loads only when voicetut is effective.
- A cached line plays through <audio> (HTMLMediaElement.prototype.play is instrumented) while __spoken stays empty.
- A slow stand-in makes __spoken receive the line at about firstAudioMs, and the next time it plays from cache.
- Barge-in pauses the audio within 100 ms and listens, with no late fallback.
- The mic is 'speaking' during playback and idle after.
- An X-ray speak row appears.
- The existing barge-in test stays green.

Live (opt-in): tests/live/voicetut.live.test.ts
- Runs with VG_LIVE=1 and VG_VOICETUT_URL.
- info shows 19 speakers and mock:false.
- arz and en synthesize calls return a valid WAV from the endpoint's own origin.
- Prints times for cold and warm runs. The phase 1b runbook numbers come from the Mac runs.

## 4. Phase 2: the live adapter and the knowledge base

### Plan and code disagree

- §3.4 'Match a destination to a section when its target element contains or equals the section' is inverted. Every section target in the manifest sits inside its .portlet-boundary ('#layout-column_column-1 > div.portlet-boundary.portlet-static:nth-of-type(N) > section.portlet[ > … > section.section-*]'), so the target never contains or equals the section. The rule should be: the target element is inside the section (closest('.portlet-boundary')).
- §3.4 item id rule as written (link-path slug; on a clash, prefix the section id) still collides. On Services 6 cards share /en/shokran-services, 5 of them in one portlet (the 6th Shokran card has the malformed host 'web.vodafone.com.egen'); the 17 bundle cards all link /spa/miManagement; the 5 RED plans all link eshop /en/lines/red/numbers. The section prefix cannot separate cards in the same portlet. normalizeContentModel drops duplicate ids (content-index.js:52). Measured on the saved pages with the prefix lower-cased: en/services keeps 25/29, ar/services 21/29, bundles 1/17, RED 1/5, home 4/4. With the mixed-case prefix those ids fail ID_PATTERN and are dropped as invalid.
- Portlet instance ids are mixed case (w9Jro8TDb1vH) and fail ID_PATTERN /^[a-z0-9][a-z0-9-]{0,63}$/ (content-index.js:15). normalizeContentModel drops such sections (40-43), so the section id must be lower-cased.
- Phase 2 step 4 calls it 'a builder change', but the section css is produced by the crawler (jobs/crawler/extract.ts:238); the builder copies it verbatim (build.ts:386). The builder needs follow-on changes so ids and collection wrapping stay (build.ts:368, 383). The test has to run extractPage; vodafone-kb.test.ts:25 reads crawl.json that was extracted earlier.
- Phase 2 step 3: make-replay.ts:22-23 always writes fixtures/replay/<site> and deletes it first. Keeping the 2026-10-23 copy as vodafone-eg-2026-10-23 needs a git mv first or a new --out option.
- Phase 2 checks ('no Owl clones') and §7 ('tested with the RED page's clones'): the saved pages contain no Owl structure (owl-stage/owl-item/cloned = 0 on all 13 CMS pages, 2 and 4 bare .owl-carousel containers on RED and Services) because the browser crawler loaded content pages with scripts off (browser-crawler.ts:12-13,61), and replay serves them script-free (demo-browser.ts:306). The check passes trivially offline. Clone handling can only be tested live or on a hand-made Owl-shaped fixture. The live counts (RED 11 card-plan with 6 clones, Services 0 clones) are the plan's; they cannot be checked from files.
- §2 component table: '.card-collapsing (-list-item) 5 and 5' — saved RED has card-plan 5 and card-collapsing 5 on the same 5 elements, and card-collapsing-list-item 44. '.card … wireless-net 8': 6 of those 8 are FAQ .accordion-item cards and 2 are rich-text panels, not product cards. The table omits components present in the saved markup: .tiles (home 3, promotions 2), a.ticket (bundles 4, vodafone-cash 8), .brand-item (RED 11), a.quick-link (home 4), hero .hello (services, bundles, RED), .accordion-item FAQ (bundles 8, RED 5, wireless 6), and home's custom slider #carousel-container > .carousel-item.mySlides (3, not Owl).
- §3.4 'title and description from .section-title': home has 0 .section-title. The Services hero uses h2.hello-title. The Services download band uses h3.font-bold. The RED plans portlet (GuwVBj1MiBfd) has no heading; its 'first card title' fallback gives 'RED EXCLUSIVE', which is also the crawler's mislabel of collection web.vodafone-red1.layout-column_column-1. The Services Great Entertainment portlet contains #serviceModal with an h4, which the crawler took as a second section heading ('Download Ana Vodafone Scan the QR…').
- §2 / phase 2.2: GET /v1/experience returns 404 trail_off when site.trail.enabled is false (server.ts:166), and the live config has trail.enabled: false (vodafone-eg.yaml:156). It also returns collections without `fields` (handlers.ts:93), so it cannot supply the typed bundle fields §3.4 mentions.
- §3.4 'image … intrinsic size when loaded': the fixture saved no pictures (assets = stylesheets and fonts only). In replay, images come from the internet, or a 1x1 PNG offline (demo-browser.ts:312). Offline, imageShape (content-index.js) gets no width or height.
- KB carousel selectors assume no Owl: RED items 'div.owl-carousel > div.carousel-item:nth-of-type(n)' and Services visuals such as web.services.balance-transfer '#test > … > div.owl-carousel > div.carousel-item:nth-of-type(1) > …'. Owl 2 wraps items in .owl-stage-outer > .owl-stage > .owl-item, so these will not match where Owl initialises live. Not verified from files; this is inferred from the plan's live clone counts.
- §3.4 'Stickers saved last week must still match: test it against the 2026-10-23 pages and today's': only one dated capture is on disk, so this cannot be verified now. Last week's stickers carry clone ids (vodafone-services-clone/src/content/vodafone-services.js). Path-first live ids match 14 of those 29; title-first ids match 24 (English only). The clone also differs from the fixture: Play&Win links /en/play-win in the clone but is a #serviceModal card with no href in the fixture; the clone drops the 5th 'Balance transfer' card; ar Mini Call is /ar/mini-call in the clone but /spa/roaming in the fixture; ar 3alam Mama is vf.eg/anavodafone in the clone but a www2.vf-live.com proxy URL in the fixture.

### Risks

- Sync churn: 132 section destinations of 524 is 25.2%, over maxDestinationChurn 0.15 (vodafone-eg.yaml:115). destinationChurn counts any css change as re-targeted (sync-lib.ts:107-118), so the first sync after the crawler change will be held for review and needs `npm run kb -- --activate`. The experience profile is tied to kbVersionId (config/experience/vodafone-eg.profile.json references web.services.test and '#target' evidence) and needs `npm run experience -- --activate` after that.
- The next `npm run sync` without --from-crawl uses the Playwright crawler with scripts on (crawl.ts:56,95), unlike the 2026-10-23 browser crawl with scripts off. Collection, item and visual locators inside carousels may move under owl-stage/owl-item, and Owl clones may produce duplicate visuals and items. Not verified.
- Trail resolver step 1 (resolver.ts:112) takes closest('[data-vg-destination]') first. Tagging a whole portlet on Vodafone's own DOM would turn every hover inside it into the section destination, hiding finer visual and item targets that step 2 would find.
- Vodafone's live theme calls localStorage.clear() on load (demo-browser.ts:328-332). The 'vg-' guard is only injected into pages opened live from replay (264). aixc.pocket.v1 would be wiped on live pages, so id stability is moot unless phase 3 solves storage.
- CMS link errors that feed the id rule: en Edfa3ly Shokran 'https://web.vodafone.com.egen/shokran-services'; en 'Balance transfer' #5 links shokran-services; ar Mini Call links /spa/roaming; ar 3alam Mama links http://www2.vf-live.com/VFHEProxy/index.aspx?…%hashValue%; a wireless-net 'Buy Now' goes through eur05.safelinks.protection.outlook.com; the first bundles ticket links /auth/realms/vf-realm/… (sign-in, so exclude it from CTAs). 7 of 7 Great Entertainment cards in en (6 of 7 in ar) have no href (data-toggle=modal data-target=#serviceModal).
- Arabic titles slug to nothing, so ids fall back to the image file name or an ordinal. On ar bundles, 3 cards end up with ordinal ids, which shift if the cards are reordered.
- Noise from the capturing machine is in the fixture: object#__symantecPKIClientMessenger and span#__symantecPKIClientDetector ('__PRESENT') inside every RED FAQ answer. These are duplicate ids and pollute the text. The home hero img alt contains raw HTML ('<strong>New World of <span style="color:#E60000;">').
- Hidden content: 9 of the 17 bundle cards are in the inactive #Plus-Apps tab (panes #vf-plus-youtube, #vf-plus-tiktok, #vf-plus-pubg). #serviceModal (aria-hidden=true) sits inside the Great Entertainment portlet. Coverage must define 'visible'.
- There is no DOM library in either package (voice-guide: playwright, rrweb, yaml, zod, pg…; clone: vite only). The plan's `live-adapter.test.mjs` on the saved pages cannot run under plain `node --test` without Chromium (Playwright from voice-guide) or a new dependency, which needs an ADR (ADR-0008).
- Positional selectors use div:nth-of-type under #layout-column_column-1. Today every child is a portlet-boundary div (checked on 13 CMS pages); any injected div shifts every N.
- Two components carry duplicate pictures (Great Entertainment '90 Mins' has two nested img/picture). Hero and Stay-in-Control images use src while the others use data-src, and <source media srcset> carries mobile variants. Image URLs carry ?t=<timestamp> query strings, which must be stripped for image-based keys.

### Open questions

- Must item ids be equal across /en and /ar, so one Pocket holds one sticker per card? The proposed cascade gives 27/29 on Services, 5/5 on RED and 0/17 on bundles.
- Do clone-era stickers (aixc.pocket.v1 with clone ids such as 'balance-transfer' and 'sallefny-shokran') need to survive the move to live? If so, do we add a one-off alias map for Services?
- Should the Services Cash promo band and the download band become section-level single items, as the clone models them (item 'vodafone-cash', closingPromotion 'ana-vodafone-app'), or be left out of the model?
- Do cards in inactive tab panes (9 of 17 on bundles) count toward coverage and Pocket chips?
- Endpoint: is a new GET /v1/page-map gated by experiences.enabled acceptable, or should /v1/experience lose its trail gate (server.ts:166)? Recommendation: page-map.
- How does aixc.js get the site key: its own data-site-key set by loaderScript, or by reading script[data-vg-loader]?
- Crawler first locator: the full '#p_p_id_com_liferay_journal_content_web_portlet_JournalContentPortlet_INSTANCE_<id>_' or the type-agnostic '[id$="_INSTANCE_<id>_"]'?
- Brand logos (.brand-item with alt texts like 'virign' and 'b2', href javascript:;): recognise them or exclude them?
- The live Owl DOM (owl-stage-outer, owl-stage, owl-item, cloned; whether inactive items get aria-hidden) is in no file in the repo. Who captures it, and how? Phase 2's VG_LIVE Playwright test, or a scripts-on refresh of the fixture?
- Refresh path: the in-browser crawler (scripts off, same DOM shape as 2026-10-23) or `npm run sync` through the Playwright crawler (scripts on, Owl initialised)? The choice decides which DOM shape the second fixture has.

### Design sketch

Method: every count below comes from the 2026-10-23 saved pages (en and ar give identical counts per page), parsed offline with a stdlib HTML parser. 'Live' numbers are the plan's and were not re-measured.

1. Replay fixture, in brief
- fixtures/replay/vodafone-eg holds 14 pages (list in the files section) with snapshots in pages/<hash>.html.gz, plus crawl.json (PageSnaps from extractPage) and assets (5 stylesheets, Google css2, 8 WOFF fonts). No images and no JS were saved.
- installReplay (tools/demo-browser.ts:206) serves the documents and assets. It aborts scripts and API calls (306) and fetches pictures from the internet, falling back to a 1x1 PNG offline (312).
- Because capture ran with scripts off (browser-crawler.ts:61), saved pages are the server markup: bare `.owl-carousel > .carousel-item` with no Owl stage, and lazy `img.lazy[data-src]`. 27 of 34 images in /en/services #main-content have data-src; 7 have src. No img has both.
- spa/storeLocator has no #main-content.

2. Page frame (verified)
- `#main-content > div.portlet-layout.row > div#column-1 > div#layout-column_column-1 > div.portlet-boundary…`. Every child of the layout column is a JournalContentPortlet boundary div, with id `p_p_id_com_liferay_journal_content_web_portlet_JournalContentPortlet_INSTANCE_<12 chars>_`.
- Inside each boundary: `span#p_…` and `section#portlet_…_INSTANCE_<id>.portlet > div.portlet-content > div.portlet-content-container > div.portlet-body > div > div.journal-content-article > <content root>`.
- Instance ids are identical in en and ar on every page. /en/services in order: H7Y5M2gwUHRK hero 'Vodafone Services', uMh7uxmMgJvk 'Vodafone Cash', w9Jro8TDb1vH 'Stay In Control' (content root section#test), XSg0av63s0tv 'Call & Connect abroad', FkwEnp1q3ubI 'Great Entertainment' (also contains #serviceModal), CrXWnpmfOX6c 'Shokran services', WFHgzWfxIEaB 'Enjoy other services', H3fKdiE3gHvC 'Download Ana Vodafone App'.
- Owl containers carry `js-owl-carousel-<n>` (e.g. 10094358, 10109197, 10109617, 10093790; RED 12314, 14199). This number is close to the image folder ids, probably the article id, and could serve as a secondary stable key.

3. Counts per page (saved, en = ar)

| Page | portlets | .section-title | card-action | card-subscription | card-plan | card-horizontal | other | owl-carousel / owl-item / cloned | carousel-item | img (data-src/src) |
|---|---|---|---|---|---|---|---|---|---|---|
| /services | 8 | 6 | 12 (5 in w9Jro8TDb1vH carousel, 7 in FkwEnp1q3ubI widgets) | 17 (3 XSg0av63s0tv, 6 CrXWnpmfOX6c, 8 WFHgzWfxIEaB) | – | – | – | 4 / 0 / 0 | 22 | 34 (27/7) |
| /mobile-internet-bundles | 6 | 3 | – | 17 (8 #Plus--37---600EGP active, 3 each in #vf-plus-youtube, #vf-plus-tiktok, #vf-plus-pubg under the inactive #Plus-Apps tab) | – | – | .card 9 (8 accordion-item + 1), ticket 4 | 0 | 0 | 4 (3/1) |
| /vodafone-red1 | 6 | 2 | – | – | 5 (also .card-collapsing; 44 list items) | – | brand-item 11, accordion-item 5 | 2 / 0 / 0 | 16 (5 plans + 11 brands) | 21 (12/9) |
| /home | 4 | 0 | – | – | – | 4 | tiles 3, quick-link 4, slider .carousel-item.mySlides 3 | 0 | 3 | 12 (12/0) |
| /wireless-net | 10 | 2 | – | – | – | – | .card 8 (6 accordion-item) | 0 | 0 | 2 |
| /promotions (en) | 2 | 1 | – | – | – | – | tiles 2 (.tiles-wide, a.tiles-link) | 0 | 0 | 2 |
| /vodafone-cash | 9 | 5 | – | – | – | – | ticket 8 | 0 | 0 | 1 |

The plan's check (Services: 8 sections, 12 card-action, 17 card-subscription) holds on the saved pages.

4. Recogniser table (recognisers.js rows, grounded in the inspected markup)
Every item takes the closest `.portlet-boundary` as its section. Skip any match inside `.owl-item.cloned` or `.modal`, and any match `aria-hidden` by a carousel. Images: read `data-src` before `src`, resolve against location.origin, strip `?t=` for keys.

- **card-action** — `.card-action`
  - Title: `.card-action-body h4`.
  - Description: `.card-action-body p.multi-lines` (Great Entertainment). In Stay In Control, `p.view-more` 'View more' is the CTA label, not a description.
  - Image: first `.card-action-img img`.
  - Link: the card's own `a` (`.card-action > a.w-100`). Its `href` may be missing: `data-toggle=modal data-target=#serviceModal` gives cta `{ label: .card-action-btn text ('Subscribe now'), href: null }`. Otherwise the label is null when the whole card is the link.
  - Containers: `.owl-carousel > .carousel-item` or `.widget.widget-single|-double|-trible-reverse`.
- **card-subscription, service variant** — `.card-subscription` with no `.card-subscription-header`
  - Title: `.card-subscription-body-amount` (h5).
  - Description: `.card-subscription-body > p`.
  - Image: `.card-subscription-image img[data-src]`.
  - Link: `.card-subscription > a.h-100[href]`, label null.
- **card-subscription, bundle variant** — `.card-subscription` that has `.card-subscription-header`
  - Title, name and data: `.card-subscription-header-title` ('1400 Mega').
  - Price: `.card-subscription-body-amount` ('37 EGP').
  - Description: `.card-subscription-body p` (empty in the sample).
  - No image (an icon div only).
  - CTA: `.card-subscription-footer a.btn` ('Subscribe', /spa/miManagement for all 17).
  - These match the KB collection fields of web.mobile-internet-bundles.plus--37---600egp.
- **card-plan** (RED) — `.card-plan` (same element as `.card-collapsing`)
  - Title: `.card-plan-header-type h3` ('RED EXCLUSIVE').
  - Data and minutes: `.card-plan-header > h4` ×2 (`span.font-regular` value plus label span).
  - Price: `.card-plan-header p.text-2x` ('EGP 3450/month Tax Exclusive').
  - Benefits / description: `li.card-collapsing-list-item strong`.
  - Image: `.card-plan-body.text-center img`.
  - CTA: `a.btn.btn-primary` 'Buy now', eshop /en/lines/red/numbers for all 5.
- **card-horizontal** (home) — `.card.card-horizontal`
  - Title: `h4 > span:first-child`.
  - Description: `p`.
  - No image.
  - CTA: `a.color-red` (label 'Know More' or 'Download App'; relative hrefs such as `anavodafone` and `wireless-net`, one to eshop).
- **tiles** (new; home and promotions) — `.tiles`
  - Title: `.tiles-title`. Description: `.tiles-text`.
  - Image: `.tiles-img img.img-desktop` (data-src).
  - CTA: `a` / `a.tiles-link`.
- **ticket** (new; bundles and vodafone-cash) — `a.ticket`
  - Title: `.ticket-content h3`. Description: `.ticket-content p`.
  - The whole card is the link. Exclude /auth/ hrefs.
- **brand-item** (new; RED partners) — `.brand-item`
  - Title: only the img alt ('virign', 'b2').
  - Link: `href="javascript:;"`, so no link.
  - Proposed: recognise it but exclude it from coverage, or skip it.
- **Section-level rows** (not cards):
  - hero `.hello`: title `.hello-title`, falling back to the hidden `h1.d-none`; image `.section-img-wrapper img.section-img`; cta `a.btn`.
  - promo band, Services uMh7uxmMgJvk: `.section-title h2` + `h4.lead` + `img.lazy[data-src]` + `a.btn-primary[href=vodafone-cash]`. The clone models this as item 'vodafone-cash'.
  - download band, H3fKdiE3gHvC: `h3.font-bold` + `p.text-2x` + `ul.list-inline a` + QR img. The clone models this as closingPromotion 'ana-vodafone-app'.
  - FAQ `.accordion-item`: title `.accordion-title-heading`, body `.card-body`. Not a card; exclude it from coverage.
  - home `a.quick-link` sits in nav.quick-links inside #main-content. Treat it as navigation and exclude it.

5. Section title rule
1. `.section-title` not inside `.modal`: title is its `h2` text (often `h2 > strong`); subtitle is the first `h4`/`p` after it (`h4.section-subtitle`, `h4.lead`, `p.section-subtitle`, `p.my-3`); section CTA is `.section-title a.btn` (Great Entertainment).
2. Else `.hello-title`.
3. Else the first `h2`/`h3` not inside `.modal` (home: 'Vodafone rate plans', 'Other Services'; Services download band).
4. Else the matched KB destination's title.
5. Else the first card's title, then skip. RED GuwVBj1MiBfd has no heading.

Services gives 8 titled sections with this rule: 6 section-title, 1 hello-title, 1 h3.

6. Item id rule
The plan's literal rule (path slug, section-id prefix on a clash) keeps en/services 25/29, ar 21/29, bundles 1/17, RED 1/5 (section 4 has the numbers).

Proposed cascade, deterministic and checked on six pages:
- a. Path key: slug of the link path with the origin and a leading /en or /ar removed, plus the fragment, when the href exists, is http(s) or relative, and the key is unique on the page.
- b. Else image key: the /documents/ file name, decoded, with a trailing '(n)' and the extension removed, then slugged, when unique.
- c. Else ASCII title slug, when unique.
- d. Else the nearest id'd container inside the section (tab pane, e.g. 'vf-plus-youtube') joined with the title or image key.
- e. Else `${sectionIdLower}-${ordinal}`.
- Then enforce ID_PATTERN and cut to 64 characters.

Results:
- No duplicates on en/ar services, bundles and RED.
- Services: 15 path + 14 image (en); 14 + 15 (ar). en and ar ids are equal for 27 of 29 (the two differences come from the CMS errors: ar 3alam Mama 'ma.png', ar Mini Call → /spa/roaming).
- RED: 5 of 5 equal across languages. Bundles: 0 of 17 (titles differ by language; ar has 3 ordinals).
- Services en ids: spa-balancetransfer, end-of-call, spa-vodafone-services, international-balance-transfer, mobile-repair, spa-roaming, visiting-egypt, international-calls, mo-salah-world, 3alam-mama, henedy-world, vf-play, 90-minutes, up-to-egp-10-000, amr-diab, sallefny-shokran, kallemny-shokran, 3alnota, edfa3ly-shokran, rennely-shokran, wasalny-shokran, mini-call, multi-sim, short-numbers, visa-appointment, park-your-line, vodafone-advertising, 3arabety, join-us-without-changing-your-number.

Stability over time cannot be verified (one date on disk). Re-run the same function on the refreshed fixture and assert equality, recording any differences that are real CMS edits. Clone-sticker compatibility: 14 of 29 clone ids match path-first. Title-first would match 24 of 29 but fails in Arabic. If clone stickers must survive, add a one-off alias map, clone id → live id, for the Services page.

7. Section ids and coverage
- Section id: the instance id lower-cased (w9jro8tdb1vh), taken from `pb.id.match(/_INSTANCE_([A-Za-z0-9]+)_$/)`. Keep the original case in `data-aixc-section` if you like; the model id must be lower case.
- Coverage per section: matched items with a title and a link (cta.href or a whole-card href) divided by visible recognised cards. Exclude FAQ, quick-link and brand-item from the denominator. Decide whether inactive tab panes count.
- Offline coverage cannot see Owl clones. Add a small synthetic fixture with `.owl-stage-outer > .owl-stage > .owl-item(.cloned) > .carousel-item > .card-plan` for the clone-skipping unit test.

8. Knowledge link
**Matching.** For each page-map destination of kind section, faq or collection:
- Resolve its locators in order, skipping the `[data-vg-destination]` marker. Take the first locator that matches exactly one element.
- Section = `el.closest('#layout-column_column-1 > .portlet-boundary')`. Ignore it if the element contains the boundary (a page wrapper).
- If one portlet gets several destinations:
  1. prefer the one whose title, normalised, equals the section title;
  2. else the deepest target (the inner `section.section-*` over the outer `section.portlet`);
  3. else collection over section.
- After the crawler change, match by `portletId` first (parsed from the new css[0]); the DOM resolution path stays for the current KB.

Checked against the manifest:
- web.services maps 8 portlets to 9 section destinations. FkwEnp1q3ubI carries download-ana-vodafone-scan-the-qr-to-enj (outer `section.portlet`, heading from the modal) and great-entertainment (inner); both tie-breaks pick great-entertainment.
- The rule reproduces all six clone pairs (main.js:20-27) and adds H7Y5M2gwUHRK → web.services.xa4e02a and H3fKdiE3gHvC → web.services.download-ana-vodafone-app.
- Bundles: CtdoyzKiywOt → vodafone-internet-bundles; evw9YawJuhOb → vodafone-plus-2 plus collection plus-apps, with the tab-pane-anchored collections (vodafone-plus, plus--37---600egp, vf-plus-youtube/tiktok/pubg) inside it; 98Im94RoICXp → frequently-asked-questions; ubytRelUayEl → mi-bundles; cwWXIDRcD1Cn → configure-my-mobile-internet; KsQnsn1nRPfN → none.
- RED: sjGphvU9YOfd → enjoy-the-latest-…; aIVZjuABL04y → only a visual; GuwVBj1MiBfd → collection layout-column_column-1 with 5 items and 5 visuals; 4QJRcAC7n4kf → x0cee7a; c6mtXmYXPGha → still-wondering…; hTwTkij4OZJG → red-points-partners.
- Home: 0oz4Hbr9LnoR (quick links) → none.

**Tagging.** Keep the map in the adapter (`data-aixc-destination` on the original DOM). Write `data-vg-destination` onto reimagined cards in outputRoot, like markReimagined does. The planner's trailing marker plus visible-first locateNow then find them while #main-content is hidden.

**Endpoint: recommend a new `GET /v1/page-map?url=`.**
- /v1/experience returns 404 while trail.enabled is false (server.ts:166; the yaml has it off).
- It carries all 46 pages with their paths and published questions (about 14 KB for the pages part; destinations 8.8 KB on Services, 17 KB on bundles, 11 KB on RED).
- It appends the marker to css, and its collections lack `fields`.
- page-map: a knowledge handler next to experience, gated by `experiences.enabled`, returning destinations (id, kind, raw css, title, collectionId, portletId) and collections (itemCss, nameField, fields).
- aixc.js calls `fetch(origin + '/__vg/v1/page-map?url=' + encodeURIComponent(location.href), { headers: { 'x-vg-site-key': key } })`, mirroring Api.get (packages/sdk/src/api.ts:36).
- Integration test alongside tests/integration/experience.test.ts.

9. Crawler change (own commit)
- In extract.ts sections loop (238), put a portlet-anchored locator first: `#p_p_id_…_INSTANCE_<id>_` plus a nth-aware path to the section element, or the type-agnostic `[id$="_INSTANCE_<id>_"]`. Keep cssFor's output after it, capped at 3 (Stay In Control becomes [portlet, '#test', positional]).
- Leave collections, visuals and actions as they are.
- Builder follow-ups:
  - build.ts:368: test wrapping against every section locator.
  - build.ts:383: fragmentFor gets the legacy locator, so web.services.test and the x-hash ids are unchanged.
  - build.ts:362 pairing is safe, because instance ids are equal across languages.
- Test: run extractPage in Playwright on the saved Services page with scripts off; assert css[0] for the 8 ids; build and assert the 9 section ids are unchanged against config/kb.
- Expect the sync gate to hold (25% > 15%). Re-activate the KB and the experience profile by hand.
