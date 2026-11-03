/**
 * The trail's sandboxed replay (rrweb `Replayer` behind the sanitizer, ADR-0035, ADR-0037 §5),
 * loaded only when a preview opens. Defines window.__vgTrailReplay.
 */
import { createPreview } from './trail/replay.ts'

;(window as any).__vgTrailReplay = { createPreview }
