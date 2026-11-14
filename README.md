# Le Col Roulé — static website

Showcase website of a holiday rental in Valloire: https://www.lecolroule.fr/, in French (the
reference), English, Dutch, German and Italian.
Generated with [Hugo](https://gohugo.io) on the "Dimension" theme by HTML5 UP (jQuery), hosted on
bunny.net (Storage Zone + Pull Zone). DNS is managed at Infomaniak.

## Layout

- `hugo.toml`: site configuration, languages and their settings (flag, Brevo form, keywords).
- `content/`: **the texts**, one Markdown file per page and per language (see "Editing content").
- `i18n/<lang>.yaml`: interface strings (language menu, close button, map button, ...).
- `layouts/`: HTML templates shared by all languages (`baseof.html`, `page.html`, `section.html`
  for the blog, `_partials/`), Markdown render hooks (`_markup/`) and shortcodes (`_shortcodes/`).
- `static/`: files copied as is: `assets/` (theme CSS/JS/webfonts, `assets/css/site.css` for our
  additions), `webfonts/`, `images/favicon/`, `favicon.ico`, `bimi.svg` (fixed URLs).
- `dist/`: build output (`hugo`), not committed.
- `3d-sources/`: working files of the 3D model (photos of the flat, first prototype), not committed.
- `scripts/deploy.py`: deployment to bunny.net (see below).
- `scripts/smoke_test.py`: checks of a deployed environment (see below).
- `scripts/newsletter.py`: sends a blog post as the newsletter (see "Newsletter").
- `scripts/dns_compare.py`: compares the DNS answers of Bunny and Infomaniak (see "DNS").
- `infra/`: bunny.net and DNS configuration as code (OpenTofu, see below).

Local preview: `hugo server --renderToMemory` (keeps `dist/` untouched), then http://localhost:1313/fr/.

## Editing content

Each page is `content/<page>.<lang>.md` (`apartment`, `shops`, `getting-there`, `ski`, `summer`,
`booking`; `_index` is the home page). Its URL is `/<lang>/<slug>/`, the slug being set in the
front matter (the block between `---` lines), together with the title and the menu position.
Languages: `fr` (reference: other languages follow its content), `en`, `nl` (neutral Dutch, also
for Flanders), `de` (Swiss spelling, "ss" and no "ß", fine for Germany and Austria too), `it`.
External links point to the page in the visitor's language when the site has one, else to its
English version (valloire.net has no German version). The newsletter sign-up form is our own
(`layouts/_partials/newsletter.html`, texts `newsletter*` in `i18n/`, `main.js` "Newsletter
form"): it is posted to the Brevo form of the language (`brevoForm` in `hugo.toml`), which adds
the address to its list and checks the Cloudflare Turnstile captcha (`captchaKey`: our widget in
the Cloudflare dashboard, its secret key set in Brevo; allowed hostnames `lecolroule.fr` and
Brevo's `sibforms.com`, so the captcha fails on `localhost`). FR goes to the French list, the other languages to the English one.

**Translation notes.** A translation may deliberately differ from a literal one (a button label
shortened to fit on phones, a link to a site's own language version, ...). Such choices are
listed in the front matter of the translated page, under `translationNotes`, and must be kept
when the page is translated again from French. Add a note whenever you fine-tune a translation.

**Inclusive language.** Every language addresses visitors and describes people without generic
masculines (moniteurs, Skilehrer, ciclisti...): neutral wording first (« vous y êtes », « pour qui
en veut toujours plus », Skilehrpersonen, Einheimische, « chi ama la disciplina »), both forms when
needed (moniteurs et monitrices, maestre e maestri), no point médian or brackets (« inscrit·e »,
« certain(e)s »): harder to read and badly read by screen readers. Icon titles name the activity,
not the person (randonnée, Wandern, corsa). Keep it when writing or translating a page.

Adding a language = adding it in `hugo.toml` (with a flag in `assets/images/`) and `i18n/`,
translating the files, and adding its pages to `PAGES` in `scripts/smoke_test.py`.

Text is Markdown: `**bold**`, `*italic*`, `- list item`, `### Heading`, `[link](https://...)`.
On top of it:

| Need | Write |
|---|---|
| Link to another page of the site (current language) | `[winter](/ski)` |
| External link (opens in a new tab) | `[Valloire](https://www.valloire.net/)` |
| Airbnb page of the current language (`airbnb` in `hugo.toml`) | `[Airbnb](airbnb:)`, `{{< button href="airbnb:" >}}Book{{< /button >}}` |
| Image with caption (caption = alt text by default) | `![Alt text](/images/x.jpg "Caption")`, `"-"` for no caption |
| Clickable photo, shown full screen in high definition | store it only as `assets/images/x_hd.jpg` (same name + `_hd`) and keep writing `/images/x.jpg` in the text: the page shows a 1200 px copy of it (sharp on phones and retina screens), the viewer the HD file (at most 2560 px), share image and `/cover.jpg` the 1200 px copy (`layouts/_partials/photo.html`). A photo stored as plain `x.jpg` is shown as is and is not clickable |
| Font Awesome icon ([list](https://fontawesome.com/v5/search?m=free)) | `{{< icon skiing >}}`, `{{< icon name="map" style="regular" >}}`, `style="brands"` |
| Row of buttons | `{{< buttons >}}` + `{{< button page="/booking" icon="calendar" primary=true >}}Book{{< /button >}}` + `{{< /buttons >}}` (`href="https://..."` for external links) |
| Route map (OpenStreetMap) | `{{< map route="getting-there" height="350" >}}` (route = `assets/maps/<route>.json`, see below) |
| Social network icons | `{{< social >}}` |
| 3D model of the flat with its visit (apartment page) | `{{< visit3d >}}` (see "3D visit" below) |

**Images**: an image of a page or a blog post that has an `_hd` version is clickable: it opens
full screen (`main.js`, "Image viewer"), with arrows (also keyboard and swipe) to the other
images of the page that have one. Decided at build time (`img.html`): images without `_hd` are
plain images. The default share image (`ogImage` in `hugo.toml`) is also published at the
fixed URL `/cover.jpg` (no fingerprint, 5-minute browser cache), for listings asking for an
image URL (OpenStreetMap...).

**Home page photos**: `homeGallery` in `hugo.toml` (the first one big, the next 4 in a 2x2
grid, all 3:2; on phones the first one only), in the header (`layouts/_partials/home-gallery.html`).
A click opens the viewer on every high-definition photo of the site, with the captions their pages
give them.

**Route maps**: `assets/maps/<route>.json` is a GeoJSON `Feature` (a `LineString`; properties
`mode` = `car` or `foot`, `from`, `to`, `distance` in metres), computed once with the OSRM servers
of openstreetmap.de and simplified: `getting-there` (Saint-Michel → Valloire by car), `walk-trail`
(flat → village centre and ESF on foot, by the footpath: summer and shops pages) and `walk-road`
(the same walk by the road, its switchbacks: winter page; computed with the car profile). E.g.
`https://routing.openstreetmap.de/routed-foot/route/v1/driving/<lon>,<lat>;<lon>,<lat>?overview=full&geometries=geojson`
(`routed-car` for the road). Option `gpx="village"` adds a "Download the GPX track" link under the
map (`assets/maps/village.gpx`, our own track). `main.js` loads Leaflet (`assets/vendor/`) and
draws a map when it comes into view (without JavaScript: a link to the route on
openstreetmap.org).

**3D visit** (also the guide for working on the model, e.g. with Fable): a 3D model of the
flat written as code with three.js, with a first-person visit, on the apartment page
(`{{< visit3d >}}`, above the winter/summer buttons).

| File | Content |
|---|---|
| `assets/js/visit3d.js` | **the model**: dimensions, materials, walls, furniture, pictures (`picture(g, 'name', ...)`); then `TOUR`, the keyframes of the visit; then the viewer (`createVisit`: preview, full screen, controls) |
| `assets/3d/textures/` | the pictures of the model, one image per texture, named after its key (`snowboard.jpg` → `'snowboard'`), `.jpg`, or `.png` for a transparent background; small: about 5 px per centimetre of the picture in the model, 1024 px at most |
| `assets/js/visit3d-textures.js` | generated by `scripts/textures.py` from the textures: **never edited by hand** |
| `assets/3d/models/` | furniture models used by the visit (OBJ reduced to vertices, faces and material names; `LICENSE.txt`: CC0) |
| `assets/js/visit3d-models.js` | generated by `scripts/models.py` from the models: **never edited by hand** |
| `assets/3d/dev.html` | test page: the model full screen, without Hugo (not published) |
| `assets/3d/catalog.html` | catalog of a pack of OBJ models kept in `3d-sources/` (thumbnails, names, sizes, large view), to choose furniture (local only, not published) |
| `assets/vendor/three-0.160.0/` | three.js: the core and the add-ons used, their `'three'` imports turned into relative paths |
| `layouts/_shortcodes/visit3d.html`, `assets/js/main.js` ("3D visit"), `assets/css/site.css` ("3D visit") | the integration in the site |
| `3d-sources/` | working files (photos of the flat, first prototype `model.html`, original textures, model packs such as `quaternius/`): ignored by git, never committed |

Testing the model, without Hugo: serve the repository root (`python3 -m http.server`, browsers
refuse modules opened as files), open http://localhost:8000/assets/3d/dev.html and reload after
each change. The console has `window.lcr` (scene, camera, controls, tour, living, night...), e.g.
`lcr.tour.seek(42)` holds the visit at 42 s, `lcr.tour.times` gives the time of each keyframe. In
the site: `hugo server`, apartment page, a click on the visit opens it full screen.

- **Model**: dimensions in centimetres, plan coordinates (x = east, z = south, origin = inner
  north-west corner of the living room; the night level has its own origin, `NIGHT_Z` further
  south); see the comments at the top of `visit3d.js`. The top of every box reaching the ceiling of
  its level (walls, paint coats) is painted grey afterwards (`capTops()`): seen from above when a
  level is shown alone, the tops of the walls all have the colour of the cut outer walls.
- **Doors**: a door in a wall is an opening with a leaf, `{ s, e, head, leaf, swing: [hinge, side] }`
  (hinge at the start `'s'` or end `'e'` of the opening, swinging to the north/west `-1` or
  south/east `+1`), drawn open on a hinge (pivot group); `name` registers it in `DOORS`
  (`addDoor()` for a door built by hand, like `wcUp`); `angle` (degrees, 90 by default) limits its
  opening (a door stopped by a piece of furniture). Full screen, a click on a door opens or
  closes it (the pointer shows a hand over it). Mind the swing of a door in the way of the visit:
  the camera must stand further from the hinge than the width of the leaf while it moves.
  `tex: 'porte'` shows the photo of a door on both faces of the leaf (`leafFaces()`), mirrored
  where needed so that the handle is always away from the hinges (the room doors; not the door at
  the foot of the stairs). A cupboard front or any closed box face shows an image with
  `faced(M.pine, { e: 'placard-droite' })` (faces `e`, `w`, `s`, `n`).
- **Pictures**: `picture(g, key, facing, wall face, from, to, bottom, top, opts)`. Without `opts`, a
  flat image on the wall. `{ depth: 2 }`: a block 2 cm thick with the image on its
  front (frames, prints; `edge: M.pine` for the colour of its sides); a PNG with a transparent
  background is cut along the outline of its opaque parts instead (skis, snowboard, panorama,
  paraglider, clock; its sides take their average colour). `METAL`: a metal cut-out 1 mm thick, 5 mm from
  the wall, with a soft shadow on the wall below it (`gap` of 0.3 cm or more).
- **Visit**: `TOUR` rows are `[x, z, floor height, heading, pitch, duration, event]` (heading in
  degrees, 0 = north, 90 = east, not wrapped so each turn's direction is explicit; duration
  optional, `null` when an event follows; event `{ close: 'wcDown' }` closes that door during the
  row). Every door is back as at load when the visit starts (open, or closed with `closed: true` / the `home` of `addDoor()`: front door, closets). In the site the preview plays it in a loop;
  full screen, it stops at the end or at the first action on the model.
- **Textures**: add or replace an image in `assets/3d/textures/` (resized first, e.g. on macOS
  `sips -Z 400 name.jpg`; originals kept in `3d-sources/`), use its name in `picture(...)`, `tex`
  or `faced()`, run `python3 scripts/textures.py` (removes the metadata of the images, camera model, dates,
  GPS position, keeping their colour profile, and regenerates `visit3d-textures.js` with the
  outlines of the PNG textures), reload the
  test page. A missing texture is reported in the console. The deployment workflow runs
  `scripts/textures.py --check` and fails if an image still has metadata, is larger than 1024 px
  or the module is out of date. Every texture is in the model's bundle (about 2 MB of its
  3 MB): keep them small. The repository is public: photos of the flat only, never people.
- **Furniture models**: the "Ultimate House Interior" pack of Quaternius (CC0, 123 OBJ models
  without textures) is kept in `3d-sources/quaternius/` (`OBJ/`, `License.txt`). To choose: serve
  the repository root, open http://localhost:8000/assets/3d/catalog.html, pick models by name. The
  pack's sizes are not to scale and its MTL colours are linear values (the catalog corrects
  them): a model used in the visit is scaled to the real size of the piece of furniture.
  To use one: `python3 scripts/models.py --add 3d-sources/quaternius/OBJ/<Name>.obj` (copies it,
  reduced, into `assets/3d/models/` and regenerates `visit3d-models.js`), then in `visit3d.js`
  `model(g, '<Name>', x, z, deg, [width, depth, height], { <OBJ material>: <material> })`:
  fitted in that box (cm), bottom centre at (x, z), facing deg (0 = south, like `placed()`); each
  material name of the OBJ gets a material of the visit (an unlisted one is grey, reported in the
  console). The deployment workflow runs `scripts/models.py --check`.
  Models get planar texture coordinates (`boxUV()`), so a material can take a grain bump map:
  `fabric(color)` for fabrics (sofa, armchairs, poufs), `grain()` for any other material.
- **Wood**: `PINE` and `OAK` repeat the images `pine.jpg` / `oak.jpg` (ambientCG Wood092 and
  Wood095, CC0, colour maps resized to 512 px) with their height maps `pine-bump.jpg` /
  `oak-bump.jpg` as bump maps (`wood(key, [u, v] cm, grain)`). A box drawn in a wood gets texture
  coordinates in metres with the grain along its longest side (`woodUV()`). Also `wood043` (night level floor), `wood034` (top of the barrel table) and `pipe002` (its hooped
  body), all ambientCG CC0; `opts.color` tints a texture (the floor greyer, the barrel browner).
  Cylinders get metre coordinates with `metreUV()`.
- **Curtains and lights**: `curtain()` (the `Curtains_Single` model, drawn back, its own rod hidden)
  and `rod()`, a chrome rod with rounded returns to the wall at the ends given (`ends`);
  `ceilingLight()` (`Light_Ceiling5`); floor lamp `Light_Stand1`.
- **three.js add-on**: copy it from the three.js 0.160.0 package (npm) into
  `assets/vendor/three-0.160.0/addons/` with the files it imports, turning `from 'three'` into a
  relative path to `three.module.js`.
- **Performance**: Hugo bundles the model, its textures and three.js into one fingerprinted file
  (about 2.8 MB minified, three quarters of it textures), imported by `main.js` only when the visit comes near the view. It is
  rendered only while on screen and the tab is visible (no GPU use otherwise), and only when
  something changes (visit playing, door swinging, action on the view, image loading: `invalidate()`
  in `createVisit`): a still view draws nothing, even full screen; at 30 images per
  second in the preview and 60 full screen whatever the refresh rate of the screen (`FPS_PREVIEW`,
  `FPS_FULL`), and hidden without JavaScript or WebGL 2.

**Blog post**: add `content/blog/YYYY-MM-DD-name.<lang>.md` for each language:

```markdown
---
title: "Post title"
date: 2026-01-31
image: { src: /images/blog/2026-01-31-photo.jpg, alt: Alt text, caption: Optional caption }
---

Post text in Markdown.
```

Posts are listed on the blog page, newest first. The date in the file name and the `date` of the
front matter must be the same: the build fails otherwise (`layouts/section.html`).

## How it works (do not break)

- One HTML page per URL and per language. Each page holds the header (with the menu) and at most one
  `<article>`; `main.js` shows that article over the header on load.
- In-site navigation (`assets/js/main.js`, "In-site navigation"): links to pages of the current
  language are followed without reloading. The target page is fetched (and preloaded on hover),
  its article swapped in with the theme's animation, and the title, meta tags, `hreflang` links and
  language switcher are updated; back/forward work the same way. The background is never reloaded,
  so its fade-in only plays on the first page. A normal page load happens for another language, on a
  fetch error, or when the target page needs stylesheets/scripts the current one lacks.
- Language menu (top right, `layouts/_partials/language-menu.html`): the 文A button opens the list
  of the site languages as flags, each linking to the current page in that language (or that
  language's home page). Choosing one stores it in the `lcr_lang` cookie (one year, `main.js`).
  No cookie is set until a language is chosen (functional preference, no consent needed).
- Root URL `/` (`layouts/alias.html`, generated by Hugo as the alias of the default language
  home page): a page, not indexed, whose script sends the visitor to `/<lang>/`: the `lcr_lang`
  cookie first, else the first language of the browser (`navigator.languages`) that the site
  has, else English; query string and hash are kept. Without JavaScript it shows the flags.
  bunny.net edge rules cannot do it: they split `Accept-Language` at commas, so they cannot tell
  which language a browser prefers.
- Map links: Google Maps by default, Apple Maps on Apple devices (iPhone, iPad, Mac; `main.js`
  "Maps links"). The map icon of `params.social` has an `appleUrl` (the Apple Maps listing);
  Markdown links to a Google Maps search get the same search on Apple Maps. Apple Maps opens in
  the device's language; the icon's title is translated (`appleMaps` in `i18n/`).
- Every 404 is answered with `/404.html` (`content/not-found.fr.md`), through the storage zone "404 File path" setting: that
  file must not be renamed or removed.
- Edge rules (`infra/modules/site/edgerules.tf`): security headers, page cache and the 301 from
  the URLs of the former single-page site (`/valloire/...`, `infra/legacy_redirects.json`) to
  their new address. **`/valloire/` → `/fr/` stays for good**: many backlinks point to it. The
  other ones are temporary (see "Planned work").

## Deployment

The repository only holds sources; nothing generated is committed (`dist/` is ignored).
Files are deployed as is, at the same path, to the storage zone.

- `.github/workflows/deploy.yml` runs `scripts/deploy.py`:
  - on push to `main` (except infra-only or Markdown-only changes): deploys to **test**
    (https://test.lecolroule.fr/);
  - manually (Actions → Website: deploy → Run workflow): deploys to **test** or **prod**, as a dry run
    by default. The `prod` environment only accepts runs from `main`.

  Release flow: merge to `main` → automatic deployment to test → check https://test.lecolroule.fr →
  run the workflow on `main` for `prod` (dry run first, then for real).
- The script takes the files tracked by git (minus `DEPLOY_EXCLUDE`: `.github/`, `infra/`,
  `scripts/`, `README.md`, `CLAUDE.md`…), uploads only those whose SHA-256 differs, deletes remote
  files that are not in the repository (except `PROTECTED` patterns, empty for now), then purges the
  pull zone. A guard aborts if more than 25 % of the remote files would be deleted.
- Prod only: the added, changed or deleted pages are then submitted to
  [IndexNow](https://www.indexnow.org/) (Bing, Yandex, Naver, Seznam…; Bing also feeds ChatGPT
  and Copilot search). The key is public: `static/<key>.txt` at the site root and `INDEXNOW_KEY`
  in `scripts/deploy.py`.
- Secrets, in the GitHub Environments `test` and `prod` (values from `tofu output` and the storage
  zone passwords): `BUNNY_STORAGE_ZONE` (the zone **name**, not its id), `BUNNY_STORAGE_PASSWORD`,
  `BUNNY_PULLZONE_ID`. Repository secrets shared by both: `BUNNY_API_KEY`, `BUNNY_STORAGE_ENDPOINT`
  (optional, defaults to `https://storage.bunnycdn.com` = Frankfurt). The workflow checks that the
  storage zone matches the target environment before deploying.
- Locally: export the same variables, then `python3 scripts/deploy.py --dry-run`.
- Plain Python 3, no dependencies.

## Newsletter

A blog post is sent as the newsletter by two Brevo campaigns, one per list: FR (`fr` posts) and
EN (`en` posts; Dutch, German and Italian subscribers are on the English list).

- Every post also has an e-mail version, built by Hugo but never deployed
  (`dist/<lang>/blog/<post>/email.html`, `layouts/blog/page.email.html`, the `email` output format of
  `hugo.toml`): title, text, image, a "Read on the site" button to the post on the blog page
  (`/<lang>/blog/#<post>`), logo, and the footer with the unsubscribe link (required by Brevo).
  Front matter `subject` and `preview` override the subject (default: title) and the preview text
  (default: start of the text). Images and links point to the prod site.
- Settings: `params.newsletter` in `hugo.toml` (sender, test address, list ids, postal address).
- `scripts/newsletter.py <post> [--send]` (e.g. `2026-12-01-winter`, the file name without
  language): creates or updates the draft campaigns "Blog <post> fr" and "Blog <post> en", then
  sends them as test e-mails, or with `--send` to the lists. `--send` is refused when the post is
  not on the prod blog page yet, or when one of its campaigns was already sent.
- Workflow "Newsletter: send" (`.github/workflows/newsletter.yml`, manual): post name and mode
  (`test` / `send`; `send` only from `main`). Repository secret `BREVO_API_KEY` (campaigns
  read/write; the key is in Proton Pass, `brevo-api-key`, and expires after one year).

Flow: write the post in French, preview it locally (the e-mail at
`http://localhost:1313/fr/blog/<post>/email.html`), translate it, merge, deploy to test then prod,
run the workflow in `test` mode, check the e-mails, then run it in `send` mode.

## SEO

- Each page: `seoTitle` (<title>, ~60 characters max), `description` (~150 characters) and
  `ogImage` (share image) in its front matter; canonical URL, `hreflang` alternates (one per
  language, x-default = en), Open Graph and Twitter tags are generated (`layouts/_partials/head.html`).
- Structured data (schema.org JSON-LD, `layouts/_partials/structured-data.html`) from
  `params.lodging` in `hugo.toml`: LodgingBusiness (home), Apartment (apartment page), Blog with
  its posts (blog page). They include the amenities (`amenities`) and, as `sameAs`, the Airbnb
  page of the language, the social links and the Google and Apple business profiles
  (`profiles`).
- Sitemap per language with the same `hreflang` alternates and `lastmod` from git.
- Images: real width/height (no layout shift), native lazy loading (`loading="lazy"`), the first
  image of a page loaded at once.

## Privacy (no consent banner)

The site sets no cookie and calls no third party that would need the visitor's consent (EU
ePrivacy rules), so it has no cookie banner:

- Google Analytics is disabled: `googleAnalyticsID` is commented out in `hugo.toml`
  (`layouts/_partials/head.html` adds it back to every page when set; it would then need a
  consent banner).
- Maps are OpenStreetMap (`map` shortcode, Leaflet): no cookie; the tiles come from
  tile.openstreetmap.org (light use, within its usage policy, attribution shown).
- `lcr_lang` (language menu) only stores a choice the visitor made.
- The 3D visit is served by the site (three.js included): no third-party request.
- The newsletter form is posted to Brevo only when the visitor subscribes; its captcha,
  Cloudflare Turnstile, sets no cookie and is loaded only when the form comes into view (blog page).

## Performance and icons

Checked with Lighthouse ([PageSpeed Insights](https://pagespeed.web.dev/), mobile and desktop).

- HTML, XML and JSON output minified (`[minify]` in `hugo.toml`); stylesheets and scripts of
  `assets/` minified and fingerprinted (`layouts/_partials/asset-url.html`, `styles.html`).
- Font Source Sans Pro served by the site (`static/webfonts/source-sans-pro-*`, `@font-face` in
  `assets/css/site.css`, latin subset, preloaded): no third-party font CDN. The theme's `@import`
  of a font CDN is removed when `main.css` is built.
- Intro (`main.js`): the theme's animations start once the page and its preloaded background
  image are ready, not on window `load` (which also waits for Google Analytics); the header text
  fades in without unfolding (an animated height moves the page: layout shift).
- Logo resized and converted to WebP at build time (`img.html` option `resize`); language flags
  are SVG.
- Icons (`layouts/_partials/favicon.html`, also used by the 404 page): `/favicon.ico` (16 and
  32 px), a 192 px PNG (Google Search wants a multiple of 48 px), the Apple touch icon and the web
  app manifest `images/favicon/manifest.json` (`.json`: served with a JSON content type).

## Smoke tests

`scripts/smoke_test.py --env test|prod` checks a deployed environment: language home pages and a
deep page per language, the root language page, HTTP→HTTPS, the 301 of every legacy
`/valloire/...` URL listed in `infra/legacy_redirects.json` (404 for unknown ones), `404.html` on
unknown URLs, the IndexNow key file, security headers, and the environment rules (test: `noindex` and analytics blocked;
prod: indexable, analytics allowed). Options: `--expect-repo-content` (every page of `dist/` served
byte-identical, proving upload and purge; run `hugo` first) and `--redirect-domains`
(`lecolroule.fr`, `lecolroule.com`, `lecolroulé.com`, `lecolroulé.fr`, with and without `www`, over
HTTP and HTTPS, must answer 301 to the prod site).
Checks, and the requests of the checks fetching many URLs, run in parallel: a few seconds.

It runs:

- after every real deployment (`deploy.yml`), with `--expect-repo-content`, plus `--redirect-domains`
  for prod;
- after every infrastructure apply (`infra.yml`), on both environments;
- every day at 05:17 UTC (`smoke.yml`), on both environments, plus the redirect domains. A failure
  triggers GitHub's "workflow run failed" e-mail.

Locally: `python3 scripts/smoke_test.py --env prod --redirect-domains`.

## Link check

- Internal links and images: Hugo fails the build on a link to an unknown page or a missing image.
- External links: `scripts/check_links.py` (after `hugo`) requests every external link of `dist/`
  without following redirects. Broken links (4xx, 5xx, unreachable) fail; redirects are listed with
  the final URL to use instead; sites blocking robots or asking for a login (Facebook, LinkedIn,
  BlaBlaCar, Google Maps, ...) are only listed. Runs every Monday (`links.yml`, "Monitoring: weekly
  link check") and manually.

## Infrastructure (bunny.net, OpenTofu)

`infra/` describes the bunny.net resources of the site with the official
[`BunnyWay/bunnynet`](https://registry.terraform.io/providers/BunnyWay/bunnynet) provider:

| File | Content |
|---|---|
| `main.tf` | the environments: `module.prod` (`www.lecolroule.fr`), `module.test` (`test.lecolroule.fr`) |
| `modules/site/main.tf` | one environment: storage zone (404 → `not_found_page`), pull zone, hostname |
| `modules/site/edgerules.tf` | edge rules: security headers, legacy redirects, page cache |
| `dns.tf` | DNS records `www` and `test` in the `lecolroule.fr` zone at Infomaniak (rest of the zone is managed by hand) |
| `dns_bunny.tf` | the 4 domains at Bunny DNS (zones, every record) and the redirect pull zone of the alternative hostnames (see "DNS") |
| `encryption.tf` | state/plan encryption (AES-GCM, key derived from a passphrase) |
| `secrets.env` | Proton Pass **references** to the secrets (no secret values) |

Environments are named `prod` and `test`. Each serves one page per URL under `/<lang>/`, the
root language page at `/`, and the permanent 301 from the former single-page site URLs listed in
`infra/legacy_redirects.json`. `test` is a staging copy of the site used to validate a
version before deploying it to `prod`: it sends `X-Robots-Tag: noindex, nofollow` and its
Content-Security-Policy blocks analytics (Google Analytics) so that stats stay clean.
Its DNS record is created by `dns.tf` before the environment, so that the TLS certificate can be
issued in the same apply.
`tofu output` shows, per environment, the storage zone name, the pull zone id and the
bunny.net hostname to use as DNS CNAME target.

Caching (module option `cache`): `prod` uses `cdn`: the CDN caches every file and is purged on
each deployment; browsers keep pages (HTML, sitemap, robots.txt) 5 minutes and other files as long
as the origin says (stylesheets, scripts and images have a content fingerprint in their URL).
`test` uses `none`: nothing is cached, so every deployment is visible at once.

Other zones of the bunny.net account belong to other projects and are not managed here.

**Public repository.** The repository is public (since 2026-11-12): never commit a secret value
(API keys, passwords, tokens, unencrypted state or plan), only references (`infra/secrets.env`) and
GitHub secrets. `.gitignore` ignores the usual secret files; GitHub secret scanning with push
protection rejects a push containing a known secret format; pull requests from outside
contributors need an approval before their workflows run (and never get the secrets).

**Secrets.** The state contains secrets (storage zone passwords, pull zone token auth key), so it is
always encrypted (`enforced = true`) and the encrypted `infra/terraform.tfstate` is committed, so
it can be shared with CI. Commit it after every `tofu apply`. Three values are needed:

- `BUNNYNET_API_KEY`: bunny.net account API key;
- `INFOMANIAK_TOKEN`: Infomaniak API token restricted to DNS (Profile → Developer → API tokens);
- `TF_VAR_state_passphrase`: state encryption passphrase. **Losing it makes the state unreadable**:
  it is kept in Proton Pass (vault `LeColRoule`) as the source of truth.

**Running locally** (requires `tofu` and a logged-in Proton Pass CLI):

```bash
cd infra
pass-cli run --env-file secrets.env -- tofu plan
```

Only the pull zone settings written in `pullzone.tf` are managed; the other settings are left as
they are in the dashboard.

**CI** (`.github/workflows/infra.yml`):

- pull request touching `infra/`: `fmt -check`, `validate` and `plan`, shown in the run summary;
- push to `main` touching `infra/`: plan only (spots drift or a forgotten apply);
- manual run (Actions → Infra: bunny.net & DNS → Run workflow → `apply`, from `main`): plan,
  apply, then commit of the updated encrypted state by `github-actions[bot]`.
  Pull `main` afterwards before working on `infra/` locally.

GitHub secrets used: `BUNNY_API_KEY` (exposed as `BUNNYNET_API_KEY`), `INFOMANIAK_TOKEN` and `TF_VAR_STATE_PASSPHRASE`
(exposed as `TF_VAR_state_passphrase`).

## DNS (migration to Bunny DNS in progress)

Goal: the 4 domains (`lecolroule.fr`, `lecolroule.com`, `lecolroulé.com` = `xn--lecolroul-j4a.com`,
`lecolroulé.fr` = `xn--lecolroul-j4a.fr`) fully described in `infra/dns_bunny.tf`: their Bunny DNS
zones with every record (mail included), and the redirection of the alternative hostnames (the 4
apexes, `www` of the 3 alternative domains) to `https://www.lecolroule.fr/` by the
`le-col-roule-redirects` pull zone (301 edge rule). Infomaniak stays the registrar: the name servers
and the DNSSEC DS record of each domain are set there by hand, once.

`local.dns_domains` in `infra/dns_bunny.tf` holds the state of each domain: `infomaniak` (still
delegated to Infomaniak; the Bunny zone is ready but unused), `bunny` (delegated to Bunny; the TLS
certificates of its redirections are issued), `dnssec` (Bunny DNSSEC on, DS published at
Infomaniak). `tofu output dns` gives the Bunny name servers and, once DNSSEC is on, the DS record.

`scripts/dns_compare.py [domain]` asks both providers' name servers directly: the records that
must not change (site, mail, verification codes) must be answered identically, and Bunny must
answer an address for every redirected hostname.

Procedure, per domain (the 3 alternative ones first, they have no mail; `lecolroule.fr` last):

1. `python3 scripts/dns_compare.py <domain>`: everything as expected.
2. Infomaniak manager → domain → DNSSEC: disable it (removes the DS record at the registry), then
   **wait 48 h**: resolvers may keep the old DS that long, and a DS not matching the new name
   servers' keys makes the domain unreachable (mail included).
3. Infomaniak manager → domain → DNS servers: `kiki.bunny.net`, `coco.bunny.net`.
4. Once the new name servers are seen (`dig NS <domain>`, up to 48 h for `.com`): set the domain
   to `bunny` in `local.dns_domains`, apply (certificates of its redirections), run
   `python3 scripts/smoke_test.py --env prod --redirect-domains`. For `lecolroule.fr`, also send a
   test e-mail (e.g. mail-tester.com: SPF, DKIM, DMARC) and check that mail comes in.
5. Set it to `dnssec`, apply, then publish the DS record of `tofu output dns` at Infomaniak
   (DNSSEC → add a DS: key tag, algorithm, digest type, digest).

Afterwards: remove the Infomaniak web redirections and the `infomaniak_record` resources of
`infra/dns.tf` (with a `removed` block, so that nothing is deleted at Infomaniak while it may
still be needed), and this "in progress".

## Planned work

1. Clean up unused files now that automated deployment is validated.
2. Remove the temporary 301s of `infra/legacy_redirects.json` (every `/valloire/...` URL except
   `/valloire`, `/valloire/`, `/valloire/index.html` and `/valloire/indexfr.html`, which keep
   pointing to `/fr/`) once search engines no longer list them (Google Search Console and Bing
   Webmaster Tools, a few weeks after the switch of 2026-11-10).
3. PR checks for the website (parity of the languages with FR).
4. Cache: purge only changed URLs instead of the whole pull zone (assets are already fingerprinted).
5. Finish the move of the 4 domains to Bunny DNS (see "DNS" above).
