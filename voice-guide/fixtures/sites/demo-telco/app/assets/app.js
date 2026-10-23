// Demo Telco web app: a cookie-based demo sign-in. Separate origin from the website.
;(function () {
	const lang = (document.documentElement.lang || 'en').slice(0, 2)
	const signedIn = document.cookie.split('; ').some((c) => c.startsWith('demo_session='))
	const isLogin = location.pathname.endsWith('/login.html')
	if (!signedIn && !isLogin) {
		location.replace('/' + lang + '/login.html?next=' + encodeURIComponent(location.pathname))
		return
	}
	const form = document.getElementById('login-form')
	if (form) {
		form.addEventListener('submit', (e) => {
			e.preventDefault()
			document.cookie = 'demo_session=demo; path=/; max-age=86400; SameSite=Lax'
			location.href = new URLSearchParams(location.search).get('next') || '/' + lang + '/account.html'
		})
	}
	const out = document.getElementById('sign-out')
	if (out) {
		out.addEventListener('click', () => {
			document.cookie = 'demo_session=; path=/; max-age=0'
			location.href = '/' + lang + '/login.html'
		})
	}
})()
