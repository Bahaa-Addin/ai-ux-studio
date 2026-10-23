/**
 * A stand-in for the System One API that Jev (hosted) and Laya (laya-serve)
 * expose: POST /v1/systemone with { state, questions } and typed answers.
 * `answer` decides each question; tests use it to script behaviour.
 */
import http from 'node:http'

export interface MockJev {
	url: string
	requests: { headers: http.IncomingHttpHeaders; body: any }[]
	answer: (body: any) => Record<string, { choice: string; probabilities?: Record<string, number>; confidence?: number }>
	status: number
	delayMs: number
	close: () => Promise<void>
}

export async function startMockJev(): Promise<MockJev> {
	const mock: MockJev = {
		url: '',
		requests: [],
		status: 200,
		delayMs: 0,
		answer: (body) => {
			// Default: pick the first option of every question.
			const out: Record<string, any> = {}
			for (const [k, q] of Object.entries<any>(body.questions)) {
				const first = Object.keys(q.criteria)[0]
				out[k] = { type: 'choice', choice: first, probabilities: { [first]: 0.9 }, confidence: 0.9 }
			}
			return out
		},
		close: async () => {},
	}
	const server = http.createServer(async (req, res) => {
		let raw = ''
		for await (const c of req) raw += c
		const body = JSON.parse(raw || '{}')
		mock.requests.push({ headers: req.headers, body })
		if (mock.delayMs) await new Promise((r) => setTimeout(r, mock.delayMs))
		if (req.url !== '/v1/systemone' || req.method !== 'POST') {
			res.writeHead(404)
			return res.end()
		}
		if (mock.status !== 200) {
			res.writeHead(mock.status, { 'Content-Type': 'application/json' })
			return res.end(JSON.stringify({ error: 'mock failure' }))
		}
		res.writeHead(200, { 'Content-Type': 'application/json' })
		res.end(JSON.stringify({ model: 'jev-1.13.0', answers: mock.answer(body), usage: { input_tokens: 120, output_tokens: 0 } }))
	})
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
	mock.url = `http://127.0.0.1:${(server.address() as any).port}`
	mock.close = () => new Promise((r) => server.close(() => r()))
	return mock
}
