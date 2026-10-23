/**
 * Serves cloned pages (or the fixture sites) for each origin in a site config,
 * injecting the Guide SDK script tag into every HTML page at serve time, so
 * the clones themselves stay untouched (ADR-0012). Also serves the push
 * service worker at /vg-sw.js, which must live on the site's own origin
 * (ADR-0023). Files are read on every request: edit a clone and reload.
 */
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

import { resolveFromRoot, ROOT, type SiteConfig } from '#shared/config.ts'

const TYPES: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
	'.ico': 'image/x-icon',
	'.woff2': 'font/woff2',
}

export interface SiteServerOptions {
	gatewayUrl: string
	inject?: boolean
	/** Extra attributes on the injected tag, e.g. { 'data-xray': 'open' }. */
	tagAttributes?: Record<string, string>
}

export function scriptTag(site: SiteConfig, opts: SiteServerOptions): string {
	const attrs = { 'data-site-key': site.siteKey, ...(opts.tagAttributes || {}) }
	const extra = Object.entries(attrs)
		.map(([k, v]) => ` ${k}="${String(v).replace(/"/g, '&quot;')}"`)
		.join('')
	return `<script src="${opts.gatewayUrl}/sdk/guide.js"${extra} async></script>`
}

export async function startSiteServers(site: SiteConfig, opts: SiteServerOptions): Promise<{ close: () => Promise<void>; urls: string[] }> {
	const servers: http.Server[] = []
	for (const origin of site.origins) {
		if (!origin.serve) continue
		const root = resolveFromRoot(origin.serve)
		const url = new URL(origin.url)
		const server = http.createServer((req, res) => {
			try {
				const u = new URL(req.url || '/', origin.url)
				if (u.pathname === '/vg-sw.js') {
					const sw = path.join(ROOT, 'packages/sdk/dist/sw.js')
					if (!fs.existsSync(sw)) return send(res, 404, 'text/plain', 'Build the SDK first: npm run build:sdk')
					res.setHeader('Service-Worker-Allowed', '/')
					return send(res, 200, TYPES['.js'], fs.readFileSync(sw))
				}
				let rel = decodeURIComponent(u.pathname)
				if (rel === '/' || rel === '') {
					res.writeHead(302, { Location: `/${site.defaultLanguage}/index.html` })
					return res.end()
				}
				if (rel.endsWith('/')) rel += 'index.html'
				const file = path.join(root, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''))
				if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'text/plain', 'Not found')
				const ext = path.extname(file).toLowerCase()
				let body: Buffer | string = fs.readFileSync(file)
				if (ext === '.html' && opts.inject !== false) {
					const html = body.toString('utf8')
					const tag = scriptTag(site, opts)
					body = html.includes('</body>') ? html.replace('</body>', `${tag}\n</body>`) : html + tag
				}
				return send(res, 200, TYPES[ext] || 'application/octet-stream', body)
			} catch (e) {
				return send(res, 500, 'text/plain', String(e))
			}
		})
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject)
			server.listen(Number(url.port || 80), url.hostname, () => resolve())
		})
		servers.push(server)
	}
	return {
		urls: site.origins.filter((o) => o.serve).map((o) => o.url),
		close: () => Promise.all(servers.map((s) => new Promise<void>((r) => s.close(() => r())))).then(() => undefined),
	}
}

function send(res: http.ServerResponse, status: number, type: string, body: string | Buffer) {
	res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' })
	res.end(body)
}
