/**
 * The speech-out service (ADR-0047, ADR-0009 handler map): VoiceTut speaks the guide's replies.
 *
 * - prepare: when the router has a plan, its own words (plan.say, say, confirm and ask steps) are
 *   queued for synthesis before the page needs them, first sentence of each line first. Returns at
 *   once; a turn never waits for it.
 * - speak: the page asks for one sentence. A cached one answers at once; otherwise the sentence is
 *   queued ahead of everything else and the call waits at most `waitMs`, then says "not ready" (the
 *   page speaks it with the browser voice; the synthesis goes on and is cached for next time).
 * - audio: the WAV of a hash the service made.
 *
 * Privacy (ADR-0047 §8, AGENTS.md §4.3, §4.4): only the guide's reply text goes to VoiceTut, never the
 * person's audio, transcript or anything typed, and never a line the masking rules find personal
 * data in (reason `private`; the page's own voice says it). Lines the service knows ahead are cached on disk;
 * any other line (a value read on the page, an agent's words) only in memory. Traces carry sizes,
 * timings and hashes, never text. Off (engine `system`, or no VG_VOICETUT_URL): every call is a no-op.
 */
import path from 'node:path'

import { maskContent } from '../../packages/sdk/src/agent-mask.ts'
import { canonicalSpeech, splitSentences } from '../../packages/sdk/src/voice/sentences.ts'
import type { PlatformConfig, SiteConfig } from '../shared/config.ts'
import type { RpcContext } from '../shared/rpc.ts'
import type { Tracer } from '../shared/trace.ts'
import { SpeechCache, speechKey } from './cache.ts'
import { type Lane, SynthQueue } from './queue.ts'
import { type Speed, type Steps, VoiceTut } from './voicetut.ts'

export interface SpeechOutDeps {
	platform: PlatformConfig
	sites: Map<string, SiteConfig>
	tracer: Tracer
	fetchImpl?: typeof fetch
	/** Tests: another cache folder. Default <dataDir>/speech. */
	cacheDir?: string
}

export type SpeechReason = 'off' | 'budget' | 'error' | 'empty' | 'private'

/**
 * True when a line holds personal data by the masking rules the page uses (ADR-0018): such a line is
 * never sent to VoiceTut, whoever asks. The page checks first; this is the second gate, for any
 * caller that does not.
 */
const isPrivate = (text: string): boolean => {
	let hit = false
	// As asked for, and as it would be sent (tidied: a number broken over lines is one number).
	for (const t of [text, canonicalSpeech(text)]) maskContent(t, () => (hit = true))
	return hit
}

export interface SpeakReply {
	engine: 'voicetut' | 'system'
	hash: string | null
	ready: boolean
	cached: boolean
	ms: number
	reason?: SpeechReason
}

const GUIDANCE = 2
/** New syntheses a page may wait on at once; beyond it the browser voice speaks (a backed-up queue only grows). */
const MAX_PENDING = 8

export function createSpeechOut(deps: SpeechOutDeps) {
	const { platform } = deps
	const voicetut = platform.voicetut.url ? new VoiceTut({ url: platform.voicetut.url, fetchImpl: deps.fetchImpl, infoTimeoutMs: platform.voicetut.infoTimeoutMs, synthTimeoutMs: platform.voicetut.synthTimeoutMs }) : null
	const cache = new SpeechCache(deps.cacheDir || path.join(platform.dataDir, 'speech'))
	const queue = new SynthQueue()
	/** Hashes of lines the service was told ahead: these may be kept on disk. */
	const known = new Set<string>()
	let modelVersion: string | null = cache.modelVersion()
	let versionCheck: Promise<string> | null = null
	let lastError: string | null = null
	let touchedAt = 0
	let warmTimer: ReturnType<typeof setInterval> | null = null
	/** Preparations still finding their model version before queuing (drain waits for them too). */
	const preparing = new Set<Promise<void>>()

	/** A VoiceTut in mock mode is never used, even with a model version known from an earlier run. */
	let mockModel = false
	let mockCheckedAt = 0
	const on = (siteId: string): SiteConfig | null => {
		const site = deps.sites.get(siteId)
		if (!voicetut || site?.speech.out.engine !== 'voicetut') return null
		if (mockModel) {
			// Asked again at most once a minute, so a redeployed real model is noticed without a restart.
			if (Date.now() - mockCheckedAt > 60_000) {
				mockCheckedAt = Date.now()
				refresh().catch(() => {})
			}
			return null
		}
		return site
	}

	/** VoiceTut's own answer: its model version is adopted (a new model means new keys, so new audio). */
	const adopt = (v: string) => {
		if (v === modelVersion) return
		modelVersion = v
		cache.setModelVersion(v)
	}
	const refresh = (): Promise<string> => {
		versionCheck ??= voicetut!
			.info()
			.then((i) => {
				adopt(i.modelVersion)
				lastError = null
				mockModel = false
				return i.modelVersion
			})
			.catch((e: Error) => {
				if (/mock mode/.test(e.message)) {
					mockModel = true
					mockCheckedAt = Date.now()
				}
				throw e
			})
			.finally(() => {
				versionCheck = null
			})
		return versionCheck
	}
	/**
	 * The version known from an earlier run is used at once for keys (a cached line plays without
	 * waking the GPU) and checked once in the background; a new synthesis waits for that check, so
	 * nothing is made by a mock model or kept under an old version's key.
	 */
	let checked = false
	let verified: Promise<void> | null = null
	/** The model version (part of every key): from the cache, else asked (it wakes the GPU). */
	const version = (): Promise<string> => {
		if (modelVersion) {
			if (!checked) {
				checked = true
				verified = refresh().then(
					() => {},
					(e) => void (lastError = (e as Error).message),
				)
			}
			return Promise.resolve(modelVersion)
		}
		checked = true
		return refresh()
	}

	const settingsFor = (site: SiteConfig, lang: string) => {
		const o = site.speech.out
		const two = lang.slice(0, 2)
		return { voice: o.voice[lang] || o.voice[two] || 'Mohammed', mode: o.mode[lang] || o.mode[two] || (two === 'ar' ? 'arz' : 'en'), steps: o.steps as Steps, speed: o.speed as Speed, normalize: o.normalize }
	}

	const keyOf = (site: SiteConfig, lang: string, text: string, mv: string) => {
		const s = settingsFor(site, lang)
		return speechKey({ engine: 'voicetut', modelVersion: mv, voice: s.voice, mode: s.mode, steps: s.steps, speed: s.speed, normalize: s.normalize, guidance: GUIDANCE, text })
	}

	/** Queues one sentence (keyed under model version `mv`); resolves when it is cached (or failed). Never rejects. */
	const make = (site: SiteConfig, lang: string, text: string, hash: string, mv: string, lane: Lane, ctx: RpcContext): Promise<boolean> =>
		queue
			.enqueue(
				hash,
				async () => {
					if (cache.has(hash)) return
					const s = settingsFor(site, lang)
					const queuedAt = performance.now()
					try {
						if (verified) await verified
						if (mockModel) throw new Error('VoiceTut is running in mock mode')
						if (mv !== modelVersion) throw new Error('VoiceTut reports a new model version; the line is asked for again under it')
						const r = await voicetut!.synthesize({ text, ...s })
						cache.write(hash, r.wav, { chars: text.length, mode: s.mode, voice: s.voice, modelVersion: modelVersion || '', ms: r.ms, audioSeconds: r.audioSeconds, at: new Date().toISOString() }, known.has(hash))
						lastError = null
						await deps.tracer.event(ctx.trace, 'speech.synth', { hash: hash.slice(0, 12), chars: text.length, lane, kept: known.has(hash) ? 'disk' : 'memory', audioSeconds: r.audioSeconds, generationSeconds: r.generationSeconds }, performance.now() - queuedAt)
					} catch (e) {
						lastError = (e as Error).message
						await deps.tracer.event(ctx.trace, 'speech.synth', { hash: hash.slice(0, 12), chars: text.length, lane, error: lastError.slice(0, 200) }, performance.now() - queuedAt)
						throw e
					}
				},
				lane,
			)
			.then(
				() => true,
				() => false,
			)

	const keepWarm = () => {
		touchedAt = Date.now()
		const site = [...deps.sites.values()].find((s) => s.speech.out.engine === 'voicetut')
		const every = (site?.speech.out.keepWarmSeconds ?? 0) * 1000
		if (!voicetut || !every || warmTimer) return
		warmTimer = setInterval(() => {
			// Only while people use it (10 minutes after the last request), and never in the way of a job.
			if (Date.now() - touchedAt > 600_000) {
				clearInterval(warmTimer!)
				warmTimer = null
				return
			}
			if (queue.busy || Date.now() - queue.lastJobAt < every) return
			refresh().catch((e) => (lastError = (e as Error).message))
		}, every)
		warmTimer.unref?.()
	}

	return {
		/** A plan's known lines, made ahead. */
		async prepare(input: { siteId: string; lang: string; lines: string[] }, ctx: RpcContext): Promise<{ queued: number; cached: number; skipped?: SpeechReason }> {
			const site = on(input.siteId)
			if (!site) return { queued: 0, cached: 0, skipped: 'off' }
			keepWarm()
			const sentences = (input.lines || [])
				.filter((l) => typeof l === 'string' && !isPrivate(l))
				.map((l) => splitSentences(l))
				.filter((parts) => !parts.some(isPrivate))
			// First sentences first (the page plays those first), then the rest, in order.
			const order = [...sentences.map((s) => s.slice(0, 1)), ...sentences.map((s) => s.slice(1))].flat()
			let queued = 0
			let cached = 0
			const prep = (async () => {
				let mv: string
				try {
					mv = await version()
				} catch (e) {
					lastError = (e as Error).message
					return
				}
				for (const text of order) {
					const hash = keyOf(site, input.lang, text, mv)
					known.add(hash)
					if (cache.has(hash)) continue
					void make(site, input.lang, text, hash, mv, 'ahead', ctx)
				}
			})()
			preparing.add(prep)
			void prep.finally(() => preparing.delete(prep))
			if (modelVersion) {
				for (const text of order) {
					if (cache.has(keyOf(site, input.lang, text, modelVersion))) cached++
					else queued++
				}
			} else queued = order.length
			await deps.tracer.event(ctx.trace, 'speech.prepare', { sentences: order.length, queued, cached })
			return { queued, cached }
		},

		/** One sentence for the page: ready (with its hash) or not within `waitMs`. */
		async speak(input: { siteId: string; lang: string; text: string; waitMs?: number }, ctx: RpcContext): Promise<SpeakReply> {
			const t0 = performance.now()
			const ms = () => Math.round(performance.now() - t0)
			const site = on(input.siteId)
			if (!site) return { engine: 'system', hash: null, ready: false, cached: false, ms: ms(), reason: 'off' }
			const text = String(input.text || '').trim()
			if (!text) return { engine: 'voicetut', hash: null, ready: false, cached: false, ms: ms(), reason: 'empty' }
			if (isPrivate(text)) {
				await deps.tracer.event(ctx.trace, 'speech.private', { chars: text.length })
				return { engine: 'voicetut', hash: null, ready: false, cached: false, ms: ms(), reason: 'private' }
			}
			keepWarm()
			const budget = Math.max(0, Math.min(input.waitMs ?? site.speech.out.firstAudioMs - 150, platform.rpcTimeoutMs - 500))
			const timeout = <T>(p: Promise<T>) => Promise.race([p, new Promise<'late'>((r) => setTimeout(() => r('late'), Math.max(0, budget - ms())).unref?.())])
			let mv = modelVersion
			// A version from an earlier run is used at once; version() checks it once in the background.
			if (mv) void version()
			else {
				const v = await timeout(version().catch(() => null))
				if (v === null) return { engine: 'voicetut', hash: null, ready: false, cached: false, ms: ms(), reason: 'error' }
				if (v === 'late') return { engine: 'voicetut', hash: null, ready: false, cached: false, ms: ms(), reason: 'budget' }
				mv = v
			}
			const hash = keyOf(site, input.lang, text, mv)
			if (cache.has(hash)) return { engine: 'voicetut', hash, ready: true, cached: true, ms: ms() }
			// New work only: a sentence already queued or being made is joined (and moved up), never refused.
			if (queue.size >= MAX_PENDING && !queue.has(hash)) return { engine: 'voicetut', hash, ready: false, cached: false, ms: ms(), reason: 'budget' }
			const made = await timeout(make(site, input.lang, text, hash, mv, 'now', ctx))
			if (made === 'late') return { engine: 'voicetut', hash, ready: false, cached: false, ms: ms(), reason: 'budget' }
			if (!made) return { engine: 'voicetut', hash, ready: false, cached: false, ms: ms(), reason: 'error' }
			return { engine: 'voicetut', hash, ready: true, cached: false, ms: ms() }
		},

		/** The WAV of a sentence this service made (base64, through the JSON service seam). */
		async audio(input: { hash: string }): Promise<{ base64: string } | { missing: true }> {
			const wav = cache.read(String(input.hash || ''))
			return wav ? { base64: wav.toString('base64') } : { missing: true }
		},

		async status(_input?: unknown, _ctx?: RpcContext): Promise<{ configured: boolean; modelVersion: string | null; queued: number; busy: boolean; lastError: string | null }> {
			return { configured: !!voicetut, modelVersion, queued: queue.size, busy: queue.busy, lastError }
		},

		/** Asks VoiceTut for its model version now (speech:warm, before filling the cache). */
		async refresh(_input?: unknown, _ctx?: RpcContext): Promise<{ modelVersion: string | null; error: string | null }> {
			if (!voicetut) return { modelVersion: null, error: 'VG_VOICETUT_URL is not set' }
			try {
				return { modelVersion: await refresh(), error: null }
			} catch (e) {
				lastError = (e as Error).message
				return { modelVersion: null, error: lastError }
			}
		},

		/** Waits until nothing is queued (speech:warm, tests). */
		async drain(_input?: unknown, _ctx?: RpcContext): Promise<{ ok: true }> {
			while (preparing.size) await Promise.allSettled([...preparing])
			await queue.drain()
			return { ok: true }
		},

		async close(): Promise<void> {
			if (warmTimer) clearInterval(warmTimer)
			warmTimer = null
			queue.close()
		},
	}
}

export type SpeechOutService = ReturnType<typeof createSpeechOut>
