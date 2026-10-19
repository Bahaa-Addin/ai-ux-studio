#!/usr/bin/env node
/**
 * Zero-dependency static server for the framework-free AIXC demo.
 *
 * Mirrors Vite's dev-server layout so the same URLs work in both workflows:
 *   - files under the project root are served as-is (index.html, /src/...)
 *   - files under /public are served from the site root (/assets/..., /favicon.svg)
 *
 * Usage: node scripts/serve.mjs [--port 5173] [--host 127.0.0.1]
 * Use this when `npm install` is unavailable; `npm run dev` (Vite) is equivalent.
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const publicRoot = join(projectRoot, 'public')

const args = process.argv.slice(2)
const argValue = (name, fallback) => {
  const index = args.indexOf(name)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}
const port = Number(argValue('--port', process.env.PORT || 5173))
const host = argValue('--host', process.env.HOST || '127.0.0.1')

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}

// Keep server-only and VCS files out of the browser.
const blockedSegments = new Set(['node_modules', '.git', 'scripts', 'tests'])

const resolveInside = (base, urlPath) => {
  const candidate = normalize(join(base, urlPath))
  return candidate === base || candidate.startsWith(base + sep) ? candidate : null
}

const isFile = async (path) => {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

const server = createServer(async (request, response) => {
  try {
    const { pathname } = new URL(request.url, 'http://localhost')
    const urlPath = decodeURIComponent(pathname === '/' ? '/index.html' : pathname)

    if (urlPath.split('/').some((segment) => blockedSegments.has(segment) || segment.startsWith('.'))) {
      response.writeHead(404).end('Not found')
      return
    }

    const candidates = [resolveInside(projectRoot, urlPath), resolveInside(publicRoot, urlPath)].filter(Boolean)
    for (const filePath of candidates) {
      if (await isFile(filePath)) {
        const body = await readFile(filePath)
        response.writeHead(200, {
          'Content-Type': mimeTypes[extname(filePath).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-cache',
          'X-Content-Type-Options': 'nosniff',
        })
        response.end(body)
        return
      }
    }
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found')
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Server error')
    console.error(error)
  }
})

server.listen(port, host, () => {
  console.log(`AIXC demo running at http://${host}:${port}/`)
})
