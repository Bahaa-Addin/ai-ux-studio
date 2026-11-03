/**
 * The Exploration Trail, loaded after start-up only on sites that enable it (SPEC-06, ADR-0035):
 * consent, timeline, storage and attention. No rrweb here: the recorder and the replayer are
 * their own chunks. Defines window.__vgTrail.
 */
import { startTrail } from './trail/controller.ts'

;(window as any).__vgTrail = { start: startTrail }
