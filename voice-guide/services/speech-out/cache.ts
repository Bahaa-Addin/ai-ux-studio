/**
 * The speech cache (ADR-0047 §2). A spoken sentence is cached under a hash of everything that
 * changes its sound: the engine, the model version, the voice, VoiceTut's language mode, the steps,
 * the speed, number normalisation, the guidance and the sentence in its canonical form.
 *
 * Two places. Lines the service knows ahead (a plan's own words, the guide's fixed phrases) are
 * written to <dataDir>/speech/<hash>.wav, atomically, with a <hash>.json beside it that never holds
 * the text. Anything else (a price read on the page, an agent's line) stays in a small in-memory
 * cache only: page values never reach the disk (AGENTS.md §4.3).
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { canonicalSpeech } from '../../packages/sdk/src/voice/sentences.ts'

export const KEY_VERSION = 1

export interface SpeechKey {
	engine: 'voicetut'
	modelVersion: string
	voice: string
	mode: string
	steps: number
	speed: number
	normalize: boolean
	guidance: number
	text: string
}

export function speechKey(k: SpeechKey): string {
	const parts = [KEY_VERSION, k.engine, k.modelVersion, k.voice, k.mode, k.steps, k.speed, k.normalize, k.guidance, canonicalSpeech(k.text)]
	return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex')
}

export interface SpeechMeta {
	chars: number
	mode: string
	voice: string
	modelVersion: string
	ms: number
	audioSeconds: number
	at: string
}

const HASH = /^[a-f0-9]{64}$/

export class SpeechCache {
	readonly dir: string
	#memory = new Map<string, Buffer>()
	#memoryMax: number

	constructor(dir: string, o: { memoryMax?: number } = {}) {
		this.dir = dir
		this.#memoryMax = o.memoryMax ?? 200
	}

	#file(hash: string, ext: string): string {
		if (!HASH.test(hash)) throw new Error('not a speech hash')
		return path.join(this.dir, `${hash}.${ext}`)
	}

	has(hash: string): boolean {
		return HASH.test(hash) && (this.#memory.has(hash) || fs.existsSync(this.#file(hash, 'wav')))
	}

	read(hash: string): Buffer | null {
		if (!HASH.test(hash)) return null
		const hot = this.#memory.get(hash)
		if (hot) {
			// Most recently used last.
			this.#memory.delete(hash)
			this.#memory.set(hash, hot)
			return hot
		}
		try {
			return fs.readFileSync(this.#file(hash, 'wav'))
		} catch {
			return null
		}
	}

	/** `persist`: on disk (known lines); otherwise memory only (a page value may be in it). */
	write(hash: string, wav: Buffer, meta: SpeechMeta, persist: boolean): void {
		if (!persist) {
			this.#memory.delete(hash)
			this.#memory.set(hash, wav)
			while (this.#memory.size > this.#memoryMax) this.#memory.delete(this.#memory.keys().next().value!)
			return
		}
		fs.mkdirSync(this.dir, { recursive: true })
		const wavFile = this.#file(hash, 'wav')
		const tmp = `${wavFile}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
		fs.writeFileSync(tmp, wav)
		fs.renameSync(tmp, wavFile)
		fs.writeFileSync(this.#file(hash, 'json'), JSON.stringify(meta))
	}

	/** The last model version VoiceTut reported, so a cached line never waits for `info`. */
	modelVersion(): string | null {
		try {
			const v = JSON.parse(fs.readFileSync(path.join(this.dir, 'model.json'), 'utf8')) as { modelVersion?: unknown }
			return typeof v.modelVersion === 'string' ? v.modelVersion : null
		} catch {
			return null
		}
	}

	setModelVersion(modelVersion: string): void {
		fs.mkdirSync(this.dir, { recursive: true })
		fs.writeFileSync(path.join(this.dir, 'model.json'), JSON.stringify({ modelVersion, at: new Date().toISOString() }))
	}
}
