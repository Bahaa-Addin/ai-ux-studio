/**
 * Named language-model presets for the fallback agent (ADR-0042). `VG_LLM_PRESET=<name>` fills the
 * primary model when `VG_LLM_BASE_URL` is not set; setting `VG_LLM_BASE_URL` and `VG_LLM_MODEL`
 * replaces it. Nothing chooses a preset by default except the demo commands (`tools/demo-live.ts`).
 */

export interface LlmPreset {
	/** Shown in the terminal and the health check. */
	label: string
	baseUrl: string
	model: string
	apiKey: string
	/** Fields the provider needs in every request body. */
	body?: Record<string, unknown>
	/** Send the page's origin, as a browser calling the provider directly would. */
	sendOrigin?: boolean
	/** Printed when the preset is used: what it is for and where requests go. */
	notice: string
}

export const LLM_PRESETS: Record<string, LlmPreset> = {
	// The model page-agent's own demo bundle uses (page-agent.demo.js 1.12.4: DEMO_MODEL, DEMO_BASE_URL, DEMO_API_KEY).
	'page-agent-testing': {
		label: "page-agent's free testing API",
		baseUrl: 'https://page-ag-testing-ohftxirgbn.cn-shanghai.fcapp.run',
		model: 'qwen3.5-plus',
		apiKey: 'NA',
		// page-agent's client adds this for Qwen models; our agent asks for 'site-default', so it would not.
		body: { enable_thinking: false },
		// The testing API answers browser requests only; the agent runs in the page.
		sendOrigin: true,
		notice:
			'for technical evaluation only, not for customers; requests are processed by Alibaba Cloud in mainland China; it can be rate-limited or withdrawn without notice. Terms: https://github.com/alibaba/page-agent/blob/main/docs/terms-and-privacy.md',
	},
}

export function llmPreset(name: string | undefined): LlmPreset | undefined {
	if (!name) return undefined
	const p = LLM_PRESETS[name]
	if (!p) throw new Error(`Unknown VG_LLM_PRESET "${name}". Known presets: ${Object.keys(LLM_PRESETS).join(', ')}`)
	return p
}
