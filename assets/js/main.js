/*
	Dimension by HTML5 UP
	html5up.net | @ajlkn
	Free for personal and commercial use under the CCA 3.0 license (html5up.net/license)
*/

// Each page holds at most one <article> (built by Hugo): it is shown over the
// header on load. Closing it goes back to the home page of the current
// language (body[data-home]) without reloading.

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

				var $article = $main_articles.filter('#' + id);

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
						history.pushState(null, null, $body.data('home'));
						document.title = $body.data('home-title');

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
							$main._hide(true);
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

			// Back/forward between a page and the home URL pushed by _hide(): the
			// displayed state no longer matches the URL, so load the URL.
				$window.on('popstate', function() {
					location.reload();
				});

		// Initialize.

			// Hide main, articles.
				$main.hide();
				$main_articles.hide();

			// Show the article of this page, if any.
				if ($main_articles.length > 0) {
					$window.on('load', function() {
						$main._show($main_articles.first().attr('id'), true);
					});
				}

})(jQuery);
