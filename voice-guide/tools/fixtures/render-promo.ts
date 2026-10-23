/**
 * Renders the image-only promo banners of the fixture site. They carry text
 * only in pixels (no alt text), like many real hero banners, so the describer
 * has something real to read (ADR-0013). Run once; the PNGs are committed.
 */
import path from 'node:path'

import { chromium } from 'playwright'

import { ROOT } from '#shared/config.ts'

const banners = {
	en: {
		dir: 'ltr',
		title: 'Double data weekend',
		body: '2× GB on all mobile internet bundles',
		when: 'Thursday to Saturday',
		cta: 'See offers',
	},
	ar: {
		dir: 'rtl',
		title: 'ويك إند الداتا الدبل',
		body: 'ضعف الجيجابايت على كل باقات إنترنت الموبايل',
		when: 'من الخميس للسبت',
		cta: 'شوف العروض',
	},
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1040, height: 300 } })
for (const [lang, b] of Object.entries(banners)) {
	await page.setContent(`<!doctype html><html lang="${lang}" dir="${b.dir}"><body style="margin:0">
	<div style="width:1040px;height:300px;box-sizing:border-box;padding:44px 56px;font-family:'Noto Sans','Noto Sans Arabic','DejaVu Sans',sans-serif;
	background:linear-gradient(120deg,#0b6e6e 0%,#0e8a7e 55%,#f2b84b 100%);color:#fff;position:relative;overflow:hidden">
		<div style="position:absolute;inset-inline-end:-60px;top:-60px;width:360px;height:360px;border-radius:50%;background:rgba(255,255,255,.12)"></div>
		<div style="font-size:52px;font-weight:800;line-height:1.1">${b.title}</div>
		<div style="font-size:28px;margin-top:14px">${b.body}</div>
		<div style="font-size:22px;margin-top:8px;opacity:.9">${b.when}</div>
		<div style="display:inline-block;margin-top:24px;background:#fff;color:#0b6e6e;font-weight:700;font-size:20px;padding:10px 22px;border-radius:999px">${b.cta}</div>
		<div style="position:absolute;inset-inline-end:70px;bottom:36px;font-size:120px;font-weight:900;opacity:.95">2×</div>
	</div></body></html>`)
	await page.screenshot({ path: path.join(ROOT, `fixtures/sites/demo-telco/web/assets/promo-weekend-${lang}.png`) })
	console.log('rendered', lang)
}
await browser.close()
