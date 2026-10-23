// Demo Telco site script: tabs, checkout summary, charts. Plain JS, like a real clone.
;(function () {
	const lang = document.documentElement.lang || 'en'
	const ar = lang.startsWith('ar')

	// Tabs (WAI-ARIA pattern). The hidden panel is what the guide must reveal.
	for (const list of document.querySelectorAll('[role="tablist"]')) {
		const tabs = [...list.querySelectorAll('[role="tab"]')]
		const select = (tab) => {
			for (const t of tabs) {
				const on = t === tab
				t.setAttribute('aria-selected', String(on))
				document.getElementById(t.getAttribute('aria-controls')).hidden = !on
			}
		}
		for (const t of tabs) t.addEventListener('click', () => select(t))
		const fromHash = tabs.find((t) => '#' + t.getAttribute('aria-controls') === location.hash)
		if (fromHash) select(fromHash)
	}

	// Checkout summary from ?bundle=
	const BUNDLES = {
		'mi-10': { en: 'Super 10 · 10 GB · 150 EGP', ar: 'سوبر ١٠ · ١٠ جيجابايت · ١٥٠ جنيه' },
		'mi-25': { en: 'Mega 25 · 25 GB · 250 EGP', ar: 'ميجا ٢٥ · ٢٥ جيجابايت · ٢٥٠ جنيه' },
		'mi-60': { en: 'Ultra 60 · 60 GB · 400 EGP', ar: 'ألترا ٦٠ · ٦٠ جيجابايت · ٤٠٠ جنيه' },
		'mi-120': { en: 'Max 120 · 120 GB · 650 EGP', ar: 'ماكس ١٢٠ · ١٢٠ جيجابايت · ٦٥٠ جنيه' },
		'hi-140': { en: 'Home Lite · 140 GB · 225 EGP', ar: 'هوم لايت · ١٤٠ جيجابايت · ٢٢٥ جنيه' },
		'hi-250': { en: 'Home Plus · 250 GB · 330 EGP', ar: 'هوم بلس · ٢٥٠ جيجابايت · ٣٣٠ جنيه' },
		'hi-400': { en: 'Home Max · 400 GB · 480 EGP', ar: 'هوم ماكس · ٤٠٠ جيجابايت · ٤٨٠ جنيه' },
	}
	const summary = document.getElementById('order-summary')
	if (summary) {
		const key = new URLSearchParams(location.search).get('bundle')
		const b = BUNDLES[key]
		if (b) summary.textContent = b[ar ? 'ar' : 'en']
		document.getElementById('checkout-form')?.addEventListener('submit', (e) => {
			e.preventDefault()
			document.getElementById('order-status').hidden = false
		})
	}

	// 2D canvas bar chart, no accessible fallback (common on real sites).
	const speed = document.getElementById('speed-chart')
	if (speed) {
		const ctx = speed.getContext('2d')
		const data = ar
			? [['القاهرة', 48], ['الجيزة', 45], ['الإسكندرية', 41], ['أسوان', 22]]
			: [['Cairo', 48], ['Giza', 45], ['Alexandria', 41], ['Aswan', 22]]
		ctx.fillStyle = '#ffffff'
		ctx.fillRect(0, 0, speed.width, speed.height)
		ctx.font = '15px sans-serif'
		ctx.direction = ar ? 'rtl' : 'ltr'
		data.forEach(([city, v], i) => {
			const y = 24 + i * 52
			const w = v * 6
			ctx.fillStyle = '#0b6e6e'
			ctx.fillRect(ar ? speed.width - 120 - w : 120, y, w, 30)
			ctx.fillStyle = '#14212b'
			ctx.textAlign = ar ? 'right' : 'left'
			ctx.fillText(city, ar ? speed.width - 10 : 10, y + 20)
			ctx.textAlign = ar ? 'left' : 'right'
			ctx.fillText(v + ' Mbps', ar ? speed.width - 128 - w : 128 + w + 60, y + 20)
		})
	}

	// WebGL graphic: 5G rollout progress, four quarters as bars.
	const gl5 = document.getElementById('rollout-gl')
	if (gl5) {
		const gl = gl5.getContext('webgl')
		if (gl) {
			const vs = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }'
			const fs = 'precision mediump float; uniform vec4 c; void main(){ gl_FragColor = c; }'
			const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o }
			const pr = gl.createProgram()
			gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs))
			gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs))
			gl.linkProgram(pr)
			gl.useProgram(pr)
			gl.clearColor(1, 1, 1, 1)
			gl.clear(gl.COLOR_BUFFER_BIT)
			const buf = gl.createBuffer()
			gl.bindBuffer(gl.ARRAY_BUFFER, buf)
			const loc = gl.getAttribLocation(pr, 'p')
			gl.enableVertexAttribArray(loc)
			gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
			const cl = gl.getUniformLocation(pr, 'c')
			;[0.2, 0.35, 0.55, 0.8].forEach((h, i) => {
				const x0 = -0.85 + i * 0.45, x1 = x0 + 0.3, y0 = -0.9, y1 = -0.9 + h * 1.8
				gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([x0, y0, x1, y0, x0, y1, x1, y1]), gl.STATIC_DRAW)
				gl.uniform4f(cl, 0.04, 0.43 + i * 0.05, 0.43, 1)
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
			})
		}
	}
})()
