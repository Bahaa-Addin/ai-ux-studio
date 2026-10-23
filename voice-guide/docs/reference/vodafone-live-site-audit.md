# Vodafone Egypt live site audit

- Date: 2026-10-23, from a desktop Chromium (1009×768 and 1024×768 viewports), signed out, cookie banner left unanswered.
- Method: page DOM, computed styles, response headers, `robots.txt` and sitemaps, read in the browser.
- Purpose: the facts every spec, ADR and the build prompt rely on. Re-check anything marked **(re-verify)** before the pilot, because the live site changes.
- Earlier capture of the same design language: `../../../vodafone-services-clone/docs/design-system.md` (2026-04-21). Where this audit adds detail, this file wins.

## 1. Origins and platforms

| Origin | What it is | Framework seen | Notes |
|---|---|---|---|
| `https://web.vodafone.com.eg/en/…`, `/ar/…` | Marketing and content pages | Liferay DXP CMS (sitemap ids `p_l_id`, `layoutUuid`, `groupId=31803`); Bootstrap classes (`btn btn-primary`, `d-none d-lg-block`) | Full page loads between pages. |
| `https://web.vodafone.com.eg/spa/…` | Logged-in and tool pages: `myHome`, `miManagement`, `storeLocator`, `contact-us`, `NetworkCoverageChecker`, `search`, `vodafone-flex` | Angular 21.2.23 (`<app-root>`), one bundle `spa/main-*.js` | **Client-side routing**: moving between `/spa/` pages changes the URL without a page load. Same origin as the CMS pages. |
| `https://eshop.vodafone.com.eg/en/`, `/ar/` | Online shop: devices, lines, DSL bundles | Angular 19.2.25 (`<vf-root>`) | **Separate origin**: its own cookies, storage and consent banner. |

Some CMS URLs redirect into the SPA: `/en/vodafone-flex` → `/spa/vodafone-flex`. The knowledge base must store each page's final URL.

## 2. Headers that decide how the guide can run

| | `web.vodafone.com.eg` | `eshop.vodafone.com.eg` |
|---|---|---|
| `Content-Security-Policy` | `frame-ancestors 'self' https://eshop.vodafone.com.eg https://siebel-lb/ …` only | `default-src 'self' *; script-src 'self' 'unsafe-inline' *; connect-src 'self' *; … frame-ancestors https://web.vodafone.com.eg` |
| `X-Frame-Options` | `SAMEORIGIN` | (not set) |
| `Cache-Control` | CMS pages `max-age=14400, public`; SPA `private, max-age=14400` | `no-store, no-cache, must-revalidate` |
| Microphone permission policy | Allowed (no `Permissions-Policy` restricting it) | not checked **(re-verify)** |

Consequences:
- A script added to the page (by the tag manager, the demo browser or a proxy) may load from our gateway and call it. The main site has no `script-src` or `connect-src` restriction, and the shop allows `*`.
- **The site cannot be framed** by another origin, so "our page with Vodafone in an iframe" is not an option.
- CMS pages can be cached by the CDN for 4 hours, so a content change can take up to 4 hours to reach the crawler.

## 3. Third-party scripts on every page

| Script | Purpose | Why it matters |
|---|---|---|
| `tags.tiqcdn.com/utag/vodafone/eg-main-new/prod/utag.js` | **Tealium iQ** tag manager | The production way to add the guide's `<script>` without a site release. |
| `cdn.cookielaw.org` (OneTrust) | Cookie consent: floating banner bottom-left, `z-index: 2147483645`, plus a dark full-page filter | The guide must sit below OneTrust and never cover it. Crawler and demo browser must handle the banner. |
| `web.vodafone.com.eg/accessibility-widget/main.js` | Vodafone's accessibility widget (Angular 19.2.21 custom element `<accessibility-widget>`) | Its floating button is the reference for the guide's microphone button. See §5. |
| `ruxitagentjs_…js` | Dynatrace real-user monitoring | Our SDK's errors may show up in their monitoring. |
| `theme-assets/maintheme/js/scripts.js?v=31` | Site theme scripts | |

## 4. Design language (computed styles)

### Colour

| Token | Value | Where seen |
|---|---|---|
| Brand red | `#e60000` (`rgb(230,0,0)`) | primary buttons, accessibility button, active tab text |
| Dark red | `#990000` | start of the quick-links gradient; hover (`#900` in the clone audit) |
| Red gradient | `linear-gradient(to right top, #990000, #e60000)` | quick-links band ("Manage Account / Shop / Store Locator / Contact Us") |
| Page background | `#f4f4f4` | `body` on `web` and `eshop` |
| Text | `#333333` | `body` |
| Top bar text | `#e6e6e6` on a dark grey strip | Personal / Business switcher |
| Surface | `#ffffff` | cards, header |
| Footer ink | `#14141e` | footer (clone audit) |
| Secondary palette | turquoise `#007c92`, aqua `#00b0ca`, aubergine `#5e2750`, red violet `#9c2aa0`, spring green `#a8b400`, green `#428600`, orange `#eb9700`, yellow `#fecb00` | shared stylesheet (clone audit); use sparingly, never for the guide's primary actions |

### Type

| Use | Family (English / Arabic) | Size seen |
|---|---|---|
| Body | `vodafone-regular-en` / `vodafone-regular-ar` | 16px, line height 24px |
| Bold | `vf-bold-en` / `vf-bold-ar` (aliases `vodafone-bold-en`) | |
| Light | `vodafone-light-en` / `vodafone-light-ar` | SPA buttons use `vodafone-light-ar` |
| Main nav items | regular | 21.44px |
| Top switcher | regular | 12.8px |
| Card title (`.tiles-title`, `h3`) | regular | 28px / 28px |
| Shop | `vodafone-regular` | |

On `/spa/` pages the `body` font is unset (computes to the browser default, Times). Only components set Vodafone fonts. **The guide must not read its font from `body`.**

Mirrored font files exist in the repo: `vodafone-services-clone/public/assets/fonts/` (`vodafone-regular-en.woff`, `vodafone-bold-en.woff`, `vodafone-light-en.woff`, `vf-*.woff`). Arabic files are not mirrored yet; on the live site the page's own `@font-face` rules load them.

### Shape and depth

| Element | Style |
|---|---|
| Primary button `.btn.btn-primary` | background `#e60000`, border `1px solid #e60000`, white text, radius **6px**, padding **12px 20px**, height 42px, shadow `0 3px 6px rgba(0,0,0,.1)` |
| Card `.tiles.shadow-sm` | white, radius **6px**, padding 16px, shadow `0 2px 4px rgba(0,0,0,.075)` |
| Subscription card `.card-subscription.radius` | white card with data amount, price, "Subscribe now" link |
| Shop buttons | radius 2px |
| Header | white, 96px total (top switcher about 27px + main row 68px) |

## 5. The floating button (reference for the microphone)

`<button id="vodafone-aw-icon" class="vf-aw-fab">` opens the accessibility widget.

| Property | Value |
|---|---|
| Size | 55 × 55 px, `border-radius: 50%` |
| Fill | `#e60000`, white icon (32px SVG) |
| Ring | `border: 5px solid #ffffff` |
| Shadow | `0 6px 20px rgba(230,0,0,.35)` (red glow) |
| Position | `position: fixed`, about **20px** from the right and bottom edges, on **English and Arabic** pages (it does not mirror for RTL) |
| Present on | CMS pages (`/en/…`, `/ar/…`); **not** on `/spa/` pages or the shop |
| Stacking | `z-index: 1` inside its host, below OneTrust |

The guide must not hide, cover or replace this button: it is an accessibility feature.

## 6. Language and direction

- `/ar/…` pages: `dir="rtl"`, but `lang="ar-SA"`; the dialect in the copy is Egyptian. Use `ar-EG` for speech, whatever `lang` says.
- `/en/…` pages: `lang="en-US"`, `dir="ltr"`.
- Arabic pages mix English headings and product names ("Internet Bundles", "Vodafone Plus", "Plus Apps"). Speech and matching must handle both scripts in one sentence.
- English and Arabic pages share slugs (`/en/mobile-internet-bundles` ↔ `/ar/mobile-internet-bundles`). **There are no `hreflang` links** in the sitemaps and none were seen on pages **(re-verify)**. Pair languages by path.

## 7. Crawl surface

### robots.txt (web)

```
User-agent: *
Allow: /
# plus explicit Allow for OAI-SearchBot, ChatGPT-User, Google-Extended, Bingbot, ClaudeBot, YouBot, PerplexityBot
Sitemap: https://web.vodafone.com.eg/site-a/sitemap-en.xml
Sitemap: https://web.vodafone.com.eg/site-a/sitemap-ar.xml
```

### robots.txt (eshop)

Allows `/`, products and category queries. **Disallows** `/cart`, `/checkout`, `/wishlist`, `/register`, `/account` and product-variant query combinations (`Color=`, `Storage=`, `Size=`, `variantID=`).

### Sitemaps

| Sitemap | URLs | `lastmod` | `hreflang` |
|---|---|---|---|
| `/site-a/sitemap-en.xml` | 1,021 | on every URL | none |
| `/site-a/sitemap-ar.xml` | 1,068 | on every URL | none |
| `/sitemap.xml` (Liferay index) | 1,057 child sitemaps | | |

The site-a sitemaps include pages nobody should be guided to, for example `/en/bbbbbbb`, `/en/lorem-ipisum1`, `/en/testing4admin`, `/en/admin-liferay`, `/en/hiddenpages`, `/en/dont-remove-the-page`, `*-old`, `*_rd`, `*-bkp`, `*_backup`, `*nudge*`, `/en/iframes`, numeric slugs (`/en/323`) and staff biography pages. The crawler needs an exclude list and a seed set built from the navigation (§8), and should use the sitemap only for `lastmod` change detection. Measured with the starter config's exclude patterns: 676 of 1,021 English and 696 of 1,068 Arabic sitemap URLs still pass, mostly old campaign pages that no menu links to, so patterns alone cannot define the scope.

## 8. Real navigation (seed set for the demo)

From the English home page header, quick links and footer:

| Area | URL |
|---|---|
| Home | `/en/home`, `/ar/home` |
| Rate plans | `/en/vodafone-rate-plans` |
| RED (postpaid) | `/en/vodafone-red1` |
| Flex | `/en/vodafone-flex` → `/spa/vodafone-flex` |
| Prepaid (El-Kart) | `/en/kart-el-korout` |
| Mobile internet bundles | `/en/mobile-internet-bundles` |
| Wireless (home) internet | `/en/wireless-net` |
| Home DSL catalogue | `/en/HomeDSLcatalog` |
| DSL bundles (shop) | `https://eshop.vodafone.com.eg/en/internetServices/dsl/bundles` |
| Products and services | `/en/services` (the AIXC clone's page) |
| Promotions | `/en/promotions` |
| Vodafone Cash | `/en/vodafone-cash` |
| Wi-Fi calling | `/en/wifi-calling` |
| Ana Vodafone app | `/en/anavodafone` |
| FAQ | `/en/faq` |
| Contact | `/en/contact-us`, `/spa/contact-us` |
| Store locator | `/spa/storeLocator` |
| Network coverage map | `/spa/NetworkCoverageChecker` |
| Manage account (login) | `/spa/myHome` |
| Search | `/spa/search` |
| Shop | `https://eshop.vodafone.com.eg/en/` and category lists such as `list?categoryUrls=*smart-phones` |

## 9. A worked page: `/ar/mobile-internet-bundles`

- Hero: an image with Arabic copy **inside the picture** ("لما يبقى مفيش زيك…", Vodafone Plus, PlayStation 5 prize). Only visual understanding can answer "what does the banner say?".
- Tabs: Bootstrap `a.nav-link[href="#…"][aria-controls]`: "Vodafone Plus", "Plus Apps", "باقات Plus 37-600". The Plus Apps sub-tabs are **icon only** (`#vf-plus-youtube`, `#vf-plus-TikTok`, `#vf-plus-pubg`, no text).
- **Every tab has `aria-selected="true"`**, whichever is showing. Decide what is visible from the `.active` class and layout, not from ARIA.
- Bundles: `.card-subscription.radius` cards. In the snapshot: 1,400 MB for 37 EGP; 3,000 MB, 69; 4,750 MB, 98; 6,000 MB, 120; 10,000 MB, 180; 18,000 MB, 300; and up to 600 EGP. **(re-verify: prices change, and the guide reads them live.)**
- Each card's "اشترك الآن" (Subscribe now) links to `/spa/miManagement`, the logged-in management app. The final confirmation inside that app is the commit point; the guide stops before it.
- FAQ: numbered questions as `h3`, under "الأسئلة الشائعة".
- No `<canvas>` on this page; 75 inline SVGs (icons).

## 10. What this means for the build (summary)

1. The theme must be **fixed Vodafone tokens**, not read from the page (SPA bodies compute to Times).
2. The SDK must **follow SPA route changes** on `/spa/` pages.
3. The KB builder must **pair languages by path**, not by `hreflang`.
4. The crawler must **seed from the navigation, filter the sitemap, use `lastmod`, honour the shop's robots rules**, and render `/spa/` pages in a browser.
5. The site **cannot be framed**. Run the guide on real pages through the tag manager in production, and through a **demo browser that injects the loader** for the demo (ADR-0026).
6. The microphone button **joins the accessibility button's column**; it never replaces or covers it (SPEC-02).
7. Session continuity must cross `web` ↔ `/spa/` (same origin, no reload) and `web` ↔ `eshop` (cross-origin handoff, ADR-0016).
