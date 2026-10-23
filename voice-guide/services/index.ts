/**
 * Composition root (ADR-0009): builds every service with the same handler
 * code, bound in process (VG_SERVICES=local) or over HTTP (VG_SERVICES=http).
 */
import { createAgentProxy } from './agent/handlers.ts'
import { createKnowledge } from './knowledge/handlers.ts'
import type { Decider } from './router/deciders.ts'
import { createRouter } from './router/handlers.ts'
import { createSessions } from './sessions/handlers.ts'
import type { PlatformConfig, SiteConfig } from './shared/config.ts'
import { loadSites } from './shared/config.ts'
import { KbCache } from './shared/kb-index.ts'
import { type Client, httpClient, localClient } from './shared/rpc.ts'
import { openStore, type Store } from './shared/store/index.ts'
import { Tracer } from './shared/trace.ts'
import { createWatchService, type WatchDeps } from './watch/handlers.ts'

export interface PlatformOptions {
	platform: PlatformConfig
	store?: Store
	sites?: Map<string, SiteConfig>
	deciderFor?: (site: SiteConfig) => Decider | undefined
	watchChecker?: WatchDeps['checker']
	fetchImpl?: typeof fetch
}

export async function createServices(opts: PlatformOptions) {
	const { platform } = opts
	const store = opts.store || (await openStore(platform))
	const sites = opts.sites || loadSites(platform.sitesDir)
	const kb = new KbCache(store)
	const tracer = (name: string) => new Tracer(store, name)

	const local = {
		router: createRouter({ platform, sites, kb, tracer: tracer('router'), deciderFor: opts.deciderFor }),
		sessions: createSessions({ platform, store, tracer: tracer('sessions') }),
		knowledge: createKnowledge({ store, kb, sites }),
		agent: createAgentProxy({ platform, store, sites, tracer: tracer('agent'), fetchImpl: opts.fetchImpl }),
		watch: createWatchService({ platform, store, sites, tracer: tracer('watch'), checker: opts.watchChecker, fetchImpl: opts.fetchImpl }),
	}
	type L = typeof local
	const bind = <K extends keyof L>(name: K): Client<L[K] & Record<string, any>> => {
		const url = platform.serviceUrls[name]
		return platform.services === 'http' && url ? httpClient(url, platform.rpcTimeoutMs) : localClient(local[name] as any)
	}

	return {
		platform,
		store,
		sites,
		kb,
		tracer,
		local,
		router: bind('router'),
		sessions: bind('sessions'),
		knowledge: bind('knowledge'),
		agent: bind('agent'),
		watch: bind('watch'),
		async close() {
			await local.watch.close()
			if (!opts.store) await store.close()
		},
	}
}

export type Services = Awaited<ReturnType<typeof createServices>>
