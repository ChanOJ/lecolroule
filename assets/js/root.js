// Root page (/, layouts/alias.html): sends the visitor to the home page of their
// language, before anything is shown. The languages of the site and the default
// one are attributes of this script's tag (data-langs, data-default):
// 1. the language chosen in the language menu (cookie "lcr_lang", main.js);
// 2. else the first language of the browser that the site has;
// 3. else the default one (English).
// A file rather than an inline script: the Content-Security-Policy allows no
// inline script.
(function() {
	var tag = document.currentScript,
		langs = tag.getAttribute('data-langs').split(','),
		lang = null,
		cookie = document.cookie.match(/(?:^|;\s*)lcr_lang=([a-z]+)/),
		browser = navigator.languages || [navigator.language || ''];
	if (cookie && langs.indexOf(cookie[1]) >= 0)
		lang = cookie[1];
	for (var i = 0; !lang && i < browser.length; i++) {
		var l = String(browser[i]).toLowerCase().split('-')[0];
		if (langs.indexOf(l) >= 0)
			lang = l;
	}
	location.replace('/' + (lang || tag.getAttribute('data-default')) + '/' + location.search + location.hash);
})();
