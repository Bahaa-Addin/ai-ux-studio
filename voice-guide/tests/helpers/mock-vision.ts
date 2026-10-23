/**
 * A stand-in for an OpenAI-compatible vision model, so the describer's model
 * path is exercised without network access. It answers from the prompt's
 * element type and heading, like a model that reads the pixels would.
 */
import http from 'node:http'

export interface MockServer {
	url: string
	calls: any[]
	close: () => Promise<void>
}

const ANSWERS: { when: RegExp; descriptions: Record<string, string> }[] = [
	{
		when: /Element type: image/,
		descriptions: {
			en: 'Promo banner "Double data weekend": twice the gigabytes on all mobile internet bundles, Thursday to Saturday.',
			ar: 'بانر عرض «ويك إند الداتا الدبل»: ضعف الجيجابايت على كل باقات إنترنت الموبايل من الخميس للسبت.',
		},
	},
	{
		when: /Element type: canvas/,
		descriptions: {
			en: 'Bar chart of average download speed: Cairo 48 Mbps, Giza 45, Alexandria 41, Aswan 22.',
			ar: 'رسم بياني لمتوسط سرعة التحميل: القاهرة ٤٨ ميجابت، الجيزة ٤٥، الإسكندرية ٤١، أسوان ٢٢.',
		},
	},
	{
		when: /Element type: webgl/,
		descriptions: {
			en: '5G rollout progress by quarter, rising from about 20% to 80% of sites.',
			ar: 'تقدم تغطية الجيل الخامس حسب الربع، من حوالي ٢٠٪ إلى ٨٠٪ من المواقع.',
		},
	},
	{
		when: /Element type: svg/,
		descriptions: {
			en: 'Coverage map: 5G in Cairo, Giza and Alexandria; 4G in Aswan.',
			ar: 'خريطة التغطية: الجيل الخامس في القاهرة والجيزة والإسكندرية، والرابع في أسوان.',
		},
	},
]

export async function startMockVision(): Promise<MockServer> {
	const calls: any[] = []
	const server = http.createServer(async (req, res) => {
		let body = ''
		for await (const c of req) body += c
		const json = JSON.parse(body || '{}')
		calls.push(json)
		const text: string = json.messages?.[1]?.content?.find((p: any) => p.type === 'text')?.text || ''
		const hasImage = !!json.messages?.[1]?.content?.find((p: any) => p.type === 'image_url')?.image_url?.url?.startsWith('data:image/png;base64,')
		const hit = ANSWERS.find((a) => a.when.test(text))
		if (!hasImage || !hit) {
			res.writeHead(400, { 'Content-Type': 'application/json' })
			return res.end(JSON.stringify({ error: 'no image or unknown element type' }))
		}
		res.writeHead(200, { 'Content-Type': 'application/json' })
		res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify({ descriptions: hit.descriptions, confidence: 0.9 }) } }] }))
	})
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
	const port = (server.address() as any).port
	return { url: `http://127.0.0.1:${port}/v1`, calls, close: () => new Promise((r) => server.close(() => r())) }
}
