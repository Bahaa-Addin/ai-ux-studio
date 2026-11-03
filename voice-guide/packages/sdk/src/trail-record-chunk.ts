/**
 * The trail's recorder (rrweb `record`, ADR-0035), loaded only after consent on an eligible page.
 * Defines window.__vgTrailRecord.
 */
import { startRecording } from './trail/recorder.ts'

;(window as any).__vgTrailRecord = { startRecording }
