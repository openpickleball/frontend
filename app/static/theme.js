// Apply a stored theme choice before first paint. Without one, the system setting decides.
// Same as the inline script in site/public/index.html. It is a file, not an inline script in
// src/app.html, so the content security policy (src/csp.ts) needs no hash for it. app.html loads
// it as a blocking script in the head, and the service worker precaches it.
(function () {
	try {
		const theme = localStorage.getItem('theme');
		if (theme !== 'light' && theme !== 'dark') return;
		document.documentElement.dataset.theme = theme;
		document.querySelectorAll('meta[name="theme-color"]').forEach(function (meta) {
			meta.content = theme === 'light' ? '#f7f3e8' : '#000000';
		});
	} catch {
		// Storage is blocked: the system setting decides.
	}
})();
