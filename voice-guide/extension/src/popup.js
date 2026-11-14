const api = globalThis.browser ?? globalThis.chrome
const box = document.getElementById('on')
const START = __START__
document.getElementById('gw').textContent = `Server: ${__GATEWAY__}`
api.storage.local.get('enabled').then((v) => (box.checked = v.enabled !== false))
box.addEventListener('change', () => api.storage.local.set({ enabled: box.checked }))
document.getElementById('open').addEventListener('click', (e) => {
	e.preventDefault()
	api.tabs.create({ url: START })
	window.close()
})
