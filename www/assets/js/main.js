/*
	Dimension by HTML5 UP
	html5up.net | @ajlkn
	Free for personal and commercial use under the CCA 3.0 license (html5up.net/license)
*/

const debug = !location.hostname.startsWith('www.');
const rootPath = '/valloire/';
const error404 = '/404.html'; // must be a non existent file
const rxArticle = /^[a-z]+[a-z0-9-]*[a-z0-9]+$/i;
var mainTitle;

(function($) {

	var	$window = $(window),
		$body = $('body'),
		$wrapper = $('#wrapper'),
		$header = $('#header'),
		$footer = $('#footer'),
		$main = $('#main'),
		$main_articles = $main.children('article');

	// Breakpoints.
		breakpoints({
			xlarge:   [ '1281px',  '1680px' ],
			large:    [ '981px',   '1280px' ],
			medium:   [ '737px',   '980px'  ],
			small:    [ '481px',   '736px'  ],
			xsmall:   [ '361px',   '480px'  ],
			xxsmall:  [ null,      '360px'  ]
		});

	// Lazy loading lib
		const observer = lozad();
		observer.observe();

	// Play initial animations on page load.
		$window.on('load', function() {
			window.setTimeout(function() {
				$body.removeClass('is-preload');
			}, 100);
		});

	// Fix: Flexbox min-height bug on IE.
		if (browser.name == 'ie') {

			var flexboxFixTimeoutId;

			$window.on('resize.flexbox-fix', function() {

				clearTimeout(flexboxFixTimeoutId);

				flexboxFixTimeoutId = setTimeout(function() {

					if ($wrapper.prop('scrollHeight') > $window.height())
						$wrapper.css('height', 'auto');
					else
						$wrapper.css('height', '100vh');

				}, 250);

			}).triggerHandler('resize.flexbox-fix');

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

				var $article;

				if (rxArticle.test(id))
					$article = $main_articles.filter('#' + id);

			// No such article? Bail (should return 404).
				if (!$article || $article.length == 0) {
					location.href = error404;
					return;
				}

				if (!mainTitle) mainTitle = document.title;
				document.title = $article.children('h2').text() + ' - ' + $('h1').text();

			// Handle lock.

			// Already locked? Speed through "show" steps w/o delays.
				if (locked || (typeof initial != 'undefined' && initial === true)) {

					// Mark as switching.
						$body.addClass('is-switching');

					// Mark as visible.
						$body.addClass('is-article-visible');

					// Deactivate all articles (just in case one's already active).
						$main_articles.removeClass('active');

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
						var $currentArticle = $main_articles.filter('.active');

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
										$window
											.scrollTop(0)
											.triggerHandler('resize.flexbox-fix');

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
										$window
											.scrollTop(0)
											.triggerHandler('resize.flexbox-fix');

									// Unlock.
										setTimeout(function() {
											locked = false;
										}, delay);

								}, 25);

						}, delay);

				}
			};

			$main._hide = function(addState) {

				var $article = $main_articles.filter('.active');

				// Article not visible? Bail.
					if (!$body.hasClass('is-article-visible'))
						return;

				// Add state?
					if (typeof addState != 'undefined'
					&&	addState === true) {
						history.pushState(null, null, './');

						if (!mainTitle) mainTitle = document.title;
						document.title = mainTitle;

						// Analytics
						if (typeof gtag === "function") {
							gtag('event', 'page_view', {
								page_path: location.pathname
							});
						}
					}

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
								$window
									.scrollTop(0)
									.triggerHandler('resize.flexbox-fix');

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
									$window
										.scrollTop(0)
										.triggerHandler('resize.flexbox-fix');

								// Unlock.
									setTimeout(function() {
										locked = false;
									}, delay);

							}, 25);

					}, delay);


			};

		// Articles.
			$main_articles.each(function() {

				var $this = $(this);

				// Close.
					$('<div class="close">Close</div>')
						.appendTo($this)
						.on('click', function() {
							$main._hide();

							document.title = mainTitle;
							window.history.pushState({}, window.title, './'); // Update URL as well as browser history.

							// Analytics
							if (typeof gtag === "function") {
								gtag('event', 'page_view', {
									page_path: location.pathname
								});
							}
						});

				// Prevent clicks from inside article from bubbling.
					$this.on('click', function(event) {
						event.stopPropagation();
					});

			});

		// Events.
			$body.on('click', function(event) {

				// Article visible? Hide.
					if ($body.hasClass('is-article-visible'))
						$main._hide(true);

			});

			$window.on('keyup', function(event) {

				switch (event.keyCode) {

					case 27:

						// Article visible? Hide.
							if ($body.hasClass('is-article-visible'))
								$main._hide(true);

						break;

					default:
						break;

				}

			});

			//$window.on('hashchange', function(event) {
			// Enable client-side routing for all links on the page
			//document.querySelectorAll('a').forEach(link => link.addEventListener('click', function(event) {
			$('a').click(function(event) {
			//$(document).on("click", "a" , function(event) {

				const hrefUrl = event.target.getAttribute('href');

				// ignore absolute (ie externals) URLs
				if (!hrefUrl.includes('://')) {

					if (debug) console.log('hrefUrl=*'+hrefUrl+'*');
					const pageToLoad = hrefUrl.slice(2); // remove the leading dot-slash
					if (debug) console.log('pageToLoad=*'+pageToLoad+'*');

					if ($main_articles.filter('#'+pageToLoad).length > 0) {
						// stop the browser from navigating to the destination URL.
						event.preventDefault();
						event.stopPropagation();

						// Show article.
						if (debug) console.log('show('+pageToLoad+')');
						$main._show(pageToLoad);

						if (debug) console.log('pushState('+'./'+pageToLoad+')');

						window.history.pushState({}, window.title, './'+pageToLoad) // Update URL as well as browser history.

						// Analytics
						if (typeof gtag === "function") {
							gtag('event', 'page_view', {
								page_path: location.pathname
							});
						}
					}
					else {
						// stop the browser from navigating to the destination URL.
						event.preventDefault();
						event.stopPropagation();

						// Show article.
						if (debug) console.log('404 : *' + pageToLoad + '*');
						location.href = error404;
					}
				}
			});

		// Initialize.

			// Hide main, articles.
				$main.hide();
				$main_articles.hide();

			// Initial article.
				if (debug) console.log('location.pathname=*'+location.pathname+'*');
				var pageToLoad = location.pathname.replace(rootPath, '');
				if (debug) console.log('pageToLoad=*'+pageToLoad+'*');
				pageToLoad = pageToLoad.replace(/^[a-z][a-z]\//, '');
				if (debug) console.log('pageToLoad=*'+pageToLoad+'*');

				// if there is an article to load
				if (rxArticle.test(pageToLoad)) {
					$window.on('load', function() {
						if (debug) console.log('show('+pageToLoad+')');
						$main._show(pageToLoad, true);
					});
				}
				else if (pageToLoad != '' && $('meta[name=error]').attr("content") != 'true' ) {
					if (debug) console.log('404 : *' + pageToLoad + '*');
					location.href = error404;
				}

})(jQuery);
