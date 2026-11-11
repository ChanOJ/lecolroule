/*
	Dimension by HTML5 UP
	html5up.net | @ajlkn
	Free for personal and commercial use under the CCA 3.0 license (html5up.net/license)
*/

// Each page holds at most one <article> (built by Hugo): it is shown over the
// header on load. Links to other pages of the same language are followed
// without reloading: the target page is fetched and its article swapped in
// (see "In-site navigation"), so the background and its fade-in stay.

(function($) {

	var	$window = $(window),
		$body = $('body'),
		$header = $('#header'),
		$footer = $('#footer'),
		$main = $('#main');

	// Articles change while browsing: always look them up.
		function articles() {
			return $main.children('article');
		}


	// Nav.
		var $nav = $header.children('nav'),
			$nav_li = $nav.find('li');

		// Add "middle" alignment classes if we're dealing with an even number of items.
			if ($nav_li.length % 2 == 0) {

				$nav.addClass('use-middle');
				$nav_li.eq( ($nav_li.length / 2) ).addClass('is-middle');

			}

	// Main.
		var	delay = 325,
			locked = false;

		// Methods.
			$main._show = function(id, initial) {

				var $article = articles().filter('#' + id);

				if ($article.length == 0)
					return;

			// Handle lock.

			// Already locked? Speed through "show" steps w/o delays.
				if (locked || (typeof initial != 'undefined' && initial === true)) {

					// Mark as switching.
						$body.addClass('is-switching');

					// Mark as visible.
						$body.addClass('is-article-visible');

					// Deactivate all articles (just in case one's already active).
						articles().removeClass('active');

					// Hide header, footer.
						$header.hide();
						$footer.hide();

					// Show main, article.
						$main.show();
						$article.show();

					// Activate article.
						$article.addClass('active');

					// Unlock.
						locked = false;

					// Unmark as switching.
						setTimeout(function() {
							$body.removeClass('is-switching');
						}, (initial ? 1000 : 0));

					return;

				}

			// Lock.
				locked = true;

			// Article already visible? Just swap articles.
				if ($body.hasClass('is-article-visible')) {

					// Deactivate current article.
						var $currentArticle = articles().filter('.active');

						$currentArticle.removeClass('active');

					// Show article.
						setTimeout(function() {

							// Hide current article.
								$currentArticle.hide();

							// Show article.
								$article.show();

							// Activate article.
								setTimeout(function() {

									$article.addClass('active');

									// Window stuff.
										$window.scrollTop(0);

									// Unlock.
										setTimeout(function() {
											locked = false;
										}, delay);

								}, 25);

						}, delay);

				}

			// Otherwise, handle as normal.
				else {

					// Mark as visible.
						$body
							.addClass('is-article-visible');

					// Show article.
						setTimeout(function() {

							// Hide header, footer.
								$header.hide();
								$footer.hide();

							// Show main, article.
								$main.show();
								$article.show();

							// Activate article.
								setTimeout(function() {

									$article.addClass('active');

									// Window stuff.
										$window.scrollTop(0);

									// Unlock.
										setTimeout(function() {
											locked = false;
										}, delay);

								}, 25);

						}, delay);

				}
			};

			$main._hide = function() {

				var $article = articles().filter('.active');

				// Article not visible? Bail.
					if (!$body.hasClass('is-article-visible'))
						return;

				// Handle lock.

					// Already locked? Speed through "hide" steps w/o delays.
						if (locked) {

							// Mark as switching.
								$body.addClass('is-switching');

							// Deactivate article.
								$article.removeClass('active');

							// Hide article, main.
								$article.hide();
								$main.hide();

							// Show footer, header.
								$footer.show();
								$header.show();

							// Unmark as visible.
								$body.removeClass('is-article-visible');

							// Unlock.
								locked = false;

							// Unmark as switching.
								$body.removeClass('is-switching');

							// Window stuff.
								$window.scrollTop(0);

							return;

						}

					// Lock.
						locked = true;

				// Deactivate article.
					$article.removeClass('active');

				// Hide article.
					setTimeout(function() {

						// Hide article, main.
							$article.hide();
							$main.hide();

						// Show footer, header.
							$footer.show();
							$header.show();

						// Unmark as visible.
							setTimeout(function() {

								$body.removeClass('is-article-visible');

								// Window stuff.
									$window.scrollTop(0);

								// Unlock.
									setTimeout(function() {
										locked = false;
									}, delay);

							}, 25);

					}, delay);


			};

		// Articles: close button, clicks inside do not close.
			function setupArticle($article) {

				$('<div class="close">Close</div>')
					.appendTo($article)
					.on('click', function() {
						navigate($body.data('home'), true);
					});

				$article.on('click', function(event) {
					event.stopPropagation();
				});

			}

			articles().each(function() {
				setupArticle($(this));
			});

		// Events: click outside the article or Escape go back to the home page.
			$body.on('click', function(event) {

				if ($body.hasClass('is-article-visible'))
					navigate($body.data('home'), true);

			});

			$window.on('keyup', function(event) {

				if (event.keyCode != 27)
					return;

				if (languageMenuOpen()) {
					toggleLanguageMenu(false);
					$('#topbar .lang-toggle').trigger('focus');
				}
				else if ($body.hasClass('is-article-visible'))
					navigate($body.data('home'), true);

			});

		// Language menu (#topbar, replaced on each in-site navigation: elements
		// are looked up when used). Choosing a language stores it in the
		// "lcr_lang" cookie for a year: the root URL then redirects to it rather
		// than to the browser's language (edge rules).
			function languageMenuOpen() {
				return $('#topbar .lang-toggle').attr('aria-expanded') == 'true';
			}

			function toggleLanguageMenu(open) {
				$('#topbar .lang-toggle').attr('aria-expanded', open ? 'true' : 'false');
				$('#topbar .lang-list').prop('hidden', !open);
			}

			// Captured: runs before the links handler below, and keeps clicks on
			// the menu from closing the article (body handler).
			document.addEventListener('click', function(event) {

				var toggle = event.target.closest('#topbar .lang-toggle'),
					choice = event.target.closest('#topbar .lang-list a[data-lang]');

				if (toggle) {
					event.stopPropagation();
					toggleLanguageMenu(!languageMenuOpen());
					return;
				}

				if (choice) {
					event.stopPropagation();
					document.cookie = 'lcr_lang=' + choice.getAttribute('data-lang')
						+ '; path=/; max-age=31536000; SameSite=Lax; Secure';
					toggleLanguageMenu(false);
					return;
				}

				if (languageMenuOpen() && !event.target.closest('#topbar .lang-menu'))
					toggleLanguageMenu(false);

			}, true);

		// Maps: Google Maps sets cookies, so an embedded map is only loaded when
		// the visitor asks for it (layouts/_shortcodes/map.html). Captured:
		// articles stop clicks from bubbling.
			document.addEventListener('click', function(event) {

				var button = event.target.closest('.map-embed .map-load');

				if (!button)
					return;

				event.preventDefault();
				event.stopPropagation();

				var box = button.closest('.map-embed'),
					iframe = document.createElement('iframe');

				iframe.src = box.getAttribute('data-src');
				iframe.title = button.textContent;
				iframe.setAttribute('allowfullscreen', '');
				iframe.setAttribute('sandbox', 'allow-scripts allow-popups');
				box.textContent = '';
				box.appendChild(iframe);
				box.classList.add('is-loaded');

			}, true);

		// In-site navigation.
		//   Pages of the current language are fetched and their article swapped in
		//   with the theme's animation; title, meta tags, alternate languages and
		//   the language switcher follow. Anything else (other language, error,
		//   page needing resources this one lacks, e.g. the blog's newsletter
		//   form) falls back to a normal page load.

			var lang = document.documentElement.lang,
				pages = {};

			// Is this link a page of the site in the current language?
				function isPageLink(a) {
					return a.origin === location.origin
						&& a.pathname.indexOf('/' + lang + '/') === 0
						&& !a.target
						&& !a.hasAttribute('download')
						&& !(a.hash && a.pathname === location.pathname);
				}

			// Fetched pages, by path (also used to preload on hover).
				function fetchPage(path) {

					if (!pages[path])
						pages[path] = fetch(path, { credentials: 'same-origin' })
							.then(function(response) {
								if (!response.ok)
									throw new Error('HTTP ' + response.status);
								return response.text();
							})
							.then(function(text) {
								return new DOMParser().parseFromString(text, 'text/html');
							})
							.catch(function(error) {
								delete pages[path];
								throw error;
							});

					return pages[path];

				}

			// Does the page need a stylesheet or script this one has not loaded?
				function needsReload(doc) {

					var missing = false;

					doc.querySelectorAll('link[rel="stylesheet"][href], script[src]').forEach(function(el) {
						// <noscript> content is parsed as elements by DOMParser, not in this page.
						if (el.closest('noscript'))
							return;
						var attr = el.tagName == 'LINK' ? 'href' : 'src',
							url = el.getAttribute(attr);
						if (!document.querySelector(el.tagName.toLowerCase() + '[' + attr + '="' + url + '"]'))
							missing = true;
					});

					return missing || !!doc.querySelector('#main > article[data-full-load]');

				}

			// Title, meta tags, alternate languages, structured data, language switcher.
				function updateHead(doc) {

					var selector = 'meta[name="description"], meta[property^="og:"], meta[name^="twitter:"], '
						+ 'link[rel="canonical"], link[rel="alternate"], script[type="application/ld+json"]';

					document.title = doc.title;
					document.head.querySelectorAll(selector).forEach(function(el) { el.remove(); });
					doc.head.querySelectorAll(selector).forEach(function(el) {
						document.head.appendChild(document.importNode(el, true));
					});

					$('#topbar').html(doc.getElementById('topbar').innerHTML);

				}

			// Go to a page of the site; push: add it to the browser history.
				function navigate(path, push) {

					fetchPage(path).then(function(doc) {

						if (needsReload(doc)) {
							location.href = path;
							return;
						}

						if (push)
							history.pushState(null, '', path);

						updateHead(doc);

						if (typeof gtag === 'function')
							gtag('event', 'page_view', { page_path: path, page_title: doc.title });

						var article = doc.querySelector('#main > article');

						// Home page: no article.
							if (!article) {
								$main._hide();
								return;
							}

						// Already displayed?
							if (articles().filter('.active').attr('id') == article.id)
								return;

						// Swap: drop hidden leftovers, add the new article, show it.
							articles().not('.active').remove();

							var $article = $(document.importNode(article, true)).hide().appendTo($main);
							$article.children('.close').remove();
							setupArticle($article);
							$main._show(article.id);

					}).catch(function() {
						location.href = path;
					});

				}

			// Links: captured before articles stop the click from bubbling.
				document.addEventListener('click', function(event) {

					var a = event.target.closest('a');

					if (!a || event.defaultPrevented || event.button !== 0
					||	event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
					||	!isPageLink(a))
						return;

					event.preventDefault();
					event.stopPropagation();

					if (a.pathname !== location.pathname)
						navigate(a.pathname, true);
					else if (!articles().filter('.active').length && articles().length)
						$main._show(articles().first().attr('id'));

				}, true);

			// Preload a page when the pointer reaches its link.
				document.addEventListener('mouseover', function(event) {

					var a = event.target.closest && event.target.closest('a');

					if (a && isPageLink(a) && a.pathname !== location.pathname)
						fetchPage(a.pathname).catch(function() {});

				});

			// Back / forward.
				$window.on('popstate', function() {
					navigate(location.pathname, false);
				});

		// Initialize.

			// Hide main, articles.
				$main.hide();
				articles().hide();

			// Intro: show the article of this page, if any, then play the initial
			// animations (background fade-in, header). They start as soon as the
			// page and its background image (preloaded by the <head>) are ready,
			// not on window "load", which also waits for analytics.
				var introPlayed = false;

				function playIntro() {

					if (introPlayed)
						return;
					introPlayed = true;

					if (articles().length > 0)
						$main._show(articles().first().attr('id'), true);

					window.setTimeout(function() {
						$body.removeClass('is-preload');
					}, 100);

				}

				$(function() {
					var bg = document.querySelector('link[rel="preload"][as="image"]');
					if (!bg)
						return;
					var img = new Image();
					img.onload = img.onerror = playIntro;
					img.src = bg.href;
				});

				$window.on('load', playIntro);

			// The current page and its home page are known: no need to fetch them again.
				pages[location.pathname] = Promise.resolve(document.cloneNode(true));
				$window.on('load', function() {
					fetchPage($body.data('home')).catch(function() {});
				});

})(jQuery);
