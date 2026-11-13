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

				if (event.keyCode != 27 || viewerOpen() || viewerJustClosed() || document.documentElement.classList.contains('visit-is-open'))
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

		// Maps (layouts/_shortcodes/map.html): a route drawn on OpenStreetMap
		// with Leaflet. Leaflet and the route are only loaded when a map comes
		// into view; maps of articles swapped in later go through initMaps too.
			var leaflet = null,
				mapObserver = 'IntersectionObserver' in window ? new IntersectionObserver(function(entries) {
					entries.forEach(function(entry) {
						if (entry.isIntersecting) {
							mapObserver.unobserve(entry.target);
							drawMap(entry.target);
						}
					});
				}, { rootMargin: '200px' }) : null;

			function loadLeaflet(el) {

				if (!leaflet)
					leaflet = new Promise(function(resolve, reject) {
						var css = document.createElement('link'),
							js = document.createElement('script');
						css.rel = 'stylesheet';
						css.href = el.getAttribute('data-leaflet-css');
						js.src = el.getAttribute('data-leaflet-js');
						js.onload = resolve;
						js.onerror = reject;
						document.head.appendChild(css);
						document.head.appendChild(js);
					});

				return leaflet;

			}

			function drawMap(el) {

				Promise.all([
					loadLeaflet(el),
					fetch(el.getAttribute('data-route')).then(function(r) { return r.json(); })
				]).then(function(results) {

					var route = results[1],
						coords = route.geometry.coordinates,
						map = L.map(el, {
							scrollWheelZoom: false,
							// One finger scrolls the page on phones, two move the map.
							dragging: !L.Browser.mobile
						}),
						line = L.geoJSON(route, { style: { color: '#ff6a00', weight: 5, opacity: 0.85 } });

					// The view first: vector layers cannot be added to a map without one.
					map.fitBounds(line.getBounds(), { padding: [20, 20] });
					line.addTo(map);

					L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
						maxZoom: 19,
						// The OSM tile servers require a Referer; the site's
						// Referrer-Policy (same-origin) sends none to other sites:
						// send the site's origin (no path) for the tiles.
						referrerPolicy: 'strict-origin-when-cross-origin',
						attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
					}).addTo(map);

					[[coords[0], route.properties.from], [coords[coords.length - 1], route.properties.to]].forEach(function(end) {
						L.circleMarker([end[0][1], end[0][0]], { radius: 7, color: '#ffffff', weight: 2, fillColor: '#ff6a00', fillOpacity: 1 })
							.bindTooltip(end[1])
							.addTo(map);
					});

					el.classList.add('is-ready');

				}).catch(function(error) {
					console.error('Map', error);
					el.classList.add('is-failed');
				});

			}

			function initMaps(root) {
				root.querySelectorAll('.osm-map').forEach(function(el) {
					if (mapObserver)
						mapObserver.observe(el);
					else
						drawMap(el);
				});
			}

			initMaps(document);

		// Newsletter form (layouts/_partials/newsletter.html): posted to the
		// Brevo form with fetch, as Brevo's own script does (JSON answer). The
		// Cloudflare Turnstile captcha is loaded when the form comes into view
		// (or gets the focus); it only shows when Cloudflare wants a click
		// ("interaction-only"). Its token is sent with the form, Brevo checks it.
			var turnstile = null,
				newsletterObserver = 'IntersectionObserver' in window ? new IntersectionObserver(function(entries) {
					entries.forEach(function(entry) {
						if (entry.isIntersecting) {
							newsletterObserver.unobserve(entry.target);
							renderCaptcha(entry.target).catch(function() {});
						}
					});
				}, { rootMargin: '200px' }) : null;

			function loadTurnstile(form) {

				if (!turnstile)
					turnstile = new Promise(function(resolve, reject) {
						var js = document.createElement('script');
						js.src = form.getAttribute('data-captcha-js');
						js.async = true;
						js.onload = function() { resolve(window.turnstile); };
						js.onerror = function() { turnstile = null; reject(new Error('Turnstile not loaded')); };
						document.head.appendChild(js);
					});

				return turnstile;

			}

			function newsletterMessage(form, kind) {

				var p = form.querySelector('.newsletter-message');

				p.textContent = kind ? form.getAttribute('data-' + kind) : '';
				p.classList.toggle('is-error', kind == 'invalid' || kind == 'error');
				p.classList.toggle('is-success', kind == 'success');

				// On error, a way out: the Brevo form page itself.
				if (kind == 'error') {
					var a = document.createElement('a');
					a.href = form.action;
					a.target = '_blank';
					a.rel = 'noopener';
					a.textContent = form.getAttribute('data-fallback');
					p.append(' ', a);
				}

			}

			function newsletterBusy(form, busy) {
				form._busy = busy;
				form.querySelector('input[type="submit"]').disabled = busy;
			}

			function renderCaptcha(form) {

				if (!form._captcha) {
					form._captcha = loadTurnstile(form).then(function(ts) {
						form._widget = ts.render(form.querySelector('.newsletter-captcha'), {
							sitekey: form.getAttribute('data-captcha-key'),
							language: form.getAttribute('data-lang'),
							theme: 'dark',
							appearance: 'interaction-only',
							'response-field': false,
							callback: function(token) {
								form._token = token;
								if (form._pending) {
									form._pending = false;
									sendNewsletter(form);
								}
							},
							'expired-callback': function() {
								form._token = null;
							},
							'error-callback': function(code) {
								console.error('Newsletter captcha', code);
								form._token = null;
								form._captchaFailed = true;
								if (form._pending) {
									form._pending = false;
									newsletterMessage(form, 'error');
									newsletterBusy(form, false);
								}
							}
						});
					});
					form._captcha.catch(function() { form._captcha = null; });
				}

				return form._captcha;

			}

			function sendNewsletter(form) {

				var data = new FormData(form);

				// Brevo's page reads the token under one name or the other.
				data.set('cf-turnstile-response', form._token);
				data.set('g-recaptcha-response', form._token);
				form._token = null;

				fetch(form.action + '?isAjax=1', { method: 'POST', body: data })
					.then(function(response) { return response.json(); })
					.then(function(answer) {
						if (!answer.success)
							throw answer;
						form.reset();
						// As Brevo's form did: only the confirmation is left.
						form.classList.add('is-done');
						newsletterMessage(form, 'success');
					})
					.catch(function(error) {
						console.error('Newsletter', error);
						newsletterMessage(form, 'error');
					})
					.then(function() {
						newsletterBusy(form, false);
						// A token is valid once: get a new one for another sign-up.
						window.turnstile.reset(form._widget);
					});

			}

			function initNewsletter(root) {
				root.querySelectorAll('form.newsletter').forEach(function(form) {

					form.addEventListener('submit', function(event) {

						var email = form.querySelector('input[type="email"]');

						event.preventDefault();

						if (form._busy)
							return;

						if (!email.value || !email.checkValidity()) {
							newsletterMessage(form, 'invalid');
							email.focus();
							return;
						}

						newsletterBusy(form, true);
						newsletterMessage(form, null);

						renderCaptcha(form).then(function() {
							if (form._token)
								sendNewsletter(form);
							else {
								// Not ready yet (or waiting for a click): sent by the callback.
								form._pending = true;
								newsletterMessage(form, 'checking');
								// After a captcha error: try again.
								if (form._captchaFailed) {
									form._captchaFailed = false;
									window.turnstile.reset(form._widget);
								}
							}
						}).catch(function(error) {
							console.error('Newsletter', error);
							newsletterMessage(form, 'error');
							newsletterBusy(form, false);
						});

					});

					form.addEventListener('focusin', function() {
						renderCaptcha(form).catch(function() {});
					});

					if (newsletterObserver)
						newsletterObserver.observe(form);

				});
			}

			initNewsletter(document);

		// 3D visit (layouts/_shortcodes/visit3d.html): the model (assets/js/visit3d.js,
		// with three.js: a big file) is only loaded when the visit comes near the
		// view; it then plays in its frame and opens full screen on click. Shown
		// only when the browser has WebGL 2.
			var visitObserver = 'IntersectionObserver' in window ? new IntersectionObserver(function(entries) {
					entries.forEach(function(entry) {
						if (entry.isIntersecting) {
							visitObserver.unobserve(entry.target);
							startVisit(entry.target);
						}
					});
				}, { rootMargin: '300px' }) : null;

			function webgl2() {
				try {
					return !!document.createElement('canvas').getContext('webgl2');
				}
				catch (error) {
					return false;
				}
			}

			function startVisit(stage) {
				import(stage.getAttribute('data-visit-js')).then(function(module) {
					module.createVisit(stage, {
						labels: JSON.parse(stage.getAttribute('data-labels')),
						onOpen: function() {
							document.documentElement.classList.add('viewer-is-open', 'visit-is-open');
						},
						onClose: function() {
							document.documentElement.classList.remove('viewer-is-open', 'visit-is-open');
							// The Escape that closed it must not close the article too.
							viewerClosedAt = Date.now();
						}
					});
				}).catch(function(error) {
					console.error('3D visit', error);
					stage.parentNode.hidden = true;
				});
			}

			function initVisits(root) {
				if (!visitObserver || !webgl2())
					return;
				root.querySelectorAll('.visit3d-stage').forEach(function(stage) {
					stage.parentNode.hidden = false;
					visitObserver.observe(stage);
				});
			}

			initVisits(document);

		// Maps links: Google Maps by default, Apple Maps on Apple devices (iPhone,
		// iPad, Mac) for the links that have one (data-apple-href). iPadOS
		// presents itself as a Mac: both match.
			var appleDevice = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);

			function appleMapsLinks(root) {
				if (appleDevice)
					root.querySelectorAll('a[data-apple-href]').forEach(function(a) {
						a.href = a.getAttribute('data-apple-href');
						if (a.hasAttribute('data-apple-title'))
							a.title = a.getAttribute('data-apple-title');
					});
			}

			appleMapsLinks(document);

		// Image viewer: a click on an image of the article (a.zoom, see
		// layouts/_partials/img.html) shows it full screen, in high definition
		// when there is an "_hd" version, with the previous/next images of the
		// article: arrows, keyboard (left/right, Escape) and swipe.
			var viewer = null,
				viewerClosedAt = 0;

			function viewerOpen() {
				return !!(viewer && viewer.el.classList.contains('is-open'));
			}

			// The Escape that closed the viewer (keydown) must not close the
			// article too (keyup handler).
			function viewerJustClosed() {
				return Date.now() - viewerClosedAt < 500;
			}

			function buildViewer() {

				var el = document.createElement('div');
				el.className = 'viewer';
				el.setAttribute('role', 'dialog');
				el.setAttribute('aria-modal', 'true');
				el.innerHTML = '<figure><img alt="" /><figcaption></figcaption></figure>'
					+ '<button type="button" class="viewer-prev" aria-label="&larr;">&#8249;</button>'
					+ '<button type="button" class="viewer-next" aria-label="&rarr;">&#8250;</button>'
					+ '<button type="button" class="viewer-close" aria-label="&times;">&times;</button>'
					+ '<span class="viewer-count"></span>';
				document.body.appendChild(el);

				var v = { el: el, img: el.querySelector('img'), caption: el.querySelector('figcaption'),
					count: el.querySelector('.viewer-count'), links: [], index: 0 };

				// Clicks stay in the viewer (the body handler would close the article).
				el.addEventListener('click', function(event) {
					event.stopPropagation();
					if (event.target.closest('.viewer-prev'))
						showImage(v.index - 1);
					else if (event.target.closest('.viewer-next'))
						showImage(v.index + 1);
					else if (!event.target.closest('img'))
						closeViewer();
				});

				var startX = null;
				el.addEventListener('touchstart', function(event) {
					startX = event.touches.length == 1 ? event.touches[0].clientX : null;
				}, { passive: true });
				el.addEventListener('touchend', function(event) {
					if (startX === null)
						return;
					var dx = event.changedTouches[0].clientX - startX;
					if (Math.abs(dx) > 50)
						showImage(v.index + (dx < 0 ? 1 : -1));
					startX = null;
				});

				return v;

			}

			function showImage(index) {

				var links = viewer.links,
					n = links.length;

				viewer.index = (index + n) % n;

				var a = links[viewer.index],
					thumb = a.querySelector('img');

				viewer.img.src = a.getAttribute('href');
				viewer.img.alt = thumb ? thumb.alt : '';
				viewer.caption.textContent = a.getAttribute('data-caption') || '';
				viewer.count.textContent = n > 1 ? (viewer.index + 1) + ' / ' + n : '';
				viewer.el.classList.toggle('is-single', n < 2);

				// Preload the neighbours.
				[1, -1].forEach(function(d) {
					if (n > 1)
						(new Image()).src = links[(viewer.index + d + n) % n].getAttribute('href');
				});

			}

			function openViewer(link) {

				if (!viewer)
					viewer = buildViewer();

				// The images of the article, or of a set such as the home gallery
				// (which also holds hidden links to the other photos of the site).
				var set = link.closest('[data-viewer-set]') || link.closest('article') || document;
				viewer.links = Array.prototype.slice.call(set.querySelectorAll('a.zoom'));
				showImage(viewer.links.indexOf(link));
				viewer.el.classList.add('is-open');
				document.documentElement.classList.add('viewer-is-open');
				viewer.el.querySelector('.viewer-close').focus();

			}

			function closeViewer() {
				viewer.el.classList.remove('is-open');
				document.documentElement.classList.remove('viewer-is-open');
				viewer.img.removeAttribute('src');
				viewerClosedAt = Date.now();
			}

			// Captured: articles stop clicks from bubbling.
			document.addEventListener('click', function(event) {

				var link = event.target.closest('a.zoom');

				if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
					return;

				event.preventDefault();
				event.stopPropagation();
				openViewer(link);

			}, true);

			document.addEventListener('keydown', function(event) {

				if (!viewerOpen())
					return;

				if (event.key == 'ArrowLeft')
					showImage(viewer.index - 1);
				else if (event.key == 'ArrowRight')
					showImage(viewer.index + 1);
				else if (event.key == 'Escape')
					closeViewer();
				else
					return;

				event.preventDefault();
				event.stopPropagation();

			}, true);

		// In-site navigation.
		//   Pages of the current language are fetched and their article swapped in
		//   with the theme's animation; title, meta tags, alternate languages and
		//   the language switcher follow. Anything else (other language, error,
		//   page needing stylesheets or scripts this one lacks) falls back to a
		//   normal page load.

			var lang = document.documentElement.lang,
				pages = {};

			// Is this link a page of the site in the current language?
				function isPageLink(a) {
					var raw = a.getAttribute('href') || '';
					// Not the controls of the maps (Leaflet's zoom buttons are
					// links to "#"), nor anchors within the page.
					if (raw.charAt(0) == '#' || a.closest('.leaflet-container'))
						return false;
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

					return missing;

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
							initMaps($article[0]);
							initNewsletter($article[0]);
							initVisits($article[0]);
							appleMapsLinks($article[0]);
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

					// Link to a blog post (e.g. from the newsletter): /fr/blog/#<post>.
					if (location.hash.length > 1)
						window.setTimeout(function() {
							var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
							if (target)
								target.scrollIntoView();
						}, 400);

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
