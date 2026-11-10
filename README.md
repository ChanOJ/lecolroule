# Le Col Roulé — static website

Showcase website of a holiday rental in Valloire: https://www.lecolroule.fr/
Generated with [Hugo](https://gohugo.io) on the "Dimension" theme by HTML5 UP (jQuery), hosted on
bunny.net (Storage Zone + Pull Zone). DNS is managed at Infomaniak.

## Layout

- `hugo.toml`: site configuration, languages and their settings (flag, Brevo form, keywords).
- `content/`: **the texts**, one Markdown file per page and per language (see "Editing content").
- `i18n/<lang>.yaml`: interface strings (newsletter form, close button, ...).
- `layouts/`: HTML templates shared by all languages (`baseof.html`, `page.html`, `section.html`
  for the blog, `_partials/`), Markdown render hooks (`_markup/`) and shortcodes (`_shortcodes/`).
- `static/`: files copied as is: `assets/` (theme CSS/JS/webfonts, `assets/css/site.css` for our
  additions), `images/`, `error.html`, `favicon.ico`, `bimi.svg`.
- `dist/`: build output (`hugo`), not committed.
- `scripts/deploy.py`: deployment to bunny.net (see below).
- `scripts/smoke_test.py`: checks of a deployed environment (see below).
- `infra/`: bunny.net and DNS configuration as code (OpenTofu, see below).

Local preview: `hugo server --renderToMemory` (keeps `dist/` untouched), then http://localhost:1313/fr/.

## Editing content

Each page is `content/<page>.<lang>.md` (`apartment`, `shops`, `getting-there`, `ski`, `summer`,
`booking`; `_index` is the home page). Its URL is `/<lang>/<slug>/`, the slug being set in the
front matter (the block between `---` lines), together with the title and the menu position.
Adding a language = adding it in `hugo.toml` and `i18n/`, then translating the files.

Text is Markdown: `**bold**`, `*italic*`, `- list item`, `### Heading`, `[link](https://...)`.
On top of it:

| Need | Write |
|---|---|
| Link to another page of the site (current language) | `[winter](/ski)` |
| External link (opens in a new tab) | `[Airbnb](https://airbnb.fr/...)` |
| Image with caption (caption = alt text by default) | `![Alt text](/images/x.jpg "Caption")`, `"-"` for no caption |
| Font Awesome icon ([list](https://fontawesome.com/v5/search?m=free)) | `{{< icon skiing >}}`, `{{< icon name="map" style="regular" >}}`, `style="brands"` |
| Row of buttons | `{{< buttons >}}` + `{{< button page="/booking" icon="calendar" primary=true >}}Book{{< /button >}}` + `{{< /buttons >}}` (`href="https://..."` for external links) |
| Embedded Google map | `{{< map src="https://www.google.com/maps/embed?..." height="350" >}}` |
| Social network icons | `{{< social >}}` |

**Blog post**: add `content/blog/YYYY-MM-DD-name.<lang>.md` for each language:

```markdown
---
title: "Post title"
date: 2026-01-31
image: { src: /images/blog/2026-01-31-photo.jpg, alt: Alt text, caption: Optional caption }
---

Post text in Markdown.
```

Posts are listed on the blog page, newest first.

## How it works (do not break)

- One HTML page per URL and per language. Each page holds the header (with the menu) and at most one
  `<article>`; `main.js` shows that article over the header on load. Closing it goes back to the
  home page of the language (`body[data-home]`) without reloading.
- Every 404 is answered with `/error.html`, through the storage zone "404 File path" setting: that
  file must not be renamed or removed.
- Edge rules (`infra/modules/site/edgerules.tf`): root redirect, security headers and, for the
  legacy single-page layout, the `/valloire/*` rewrites.

## Deployment

The repository only holds sources; nothing generated is committed (`dist/` is ignored).
Files are deployed as is, at the same path, to the storage zone.

- `.github/workflows/deploy.yml` runs `scripts/deploy.py`:
  - on push to `main` (except infra-only or Markdown-only changes): deploys to **test**
    (https://test.lecolroule.fr/valloire/);
  - manually (Actions → Website: deploy → Run workflow): deploys to **test** or **prod**, as a dry run
    by default. The `prod` environment only accepts runs from `main`.

  Release flow: merge to `main` → automatic deployment to test → check https://test.lecolroule.fr →
  run the workflow on `main` for `prod` (dry run first, then for real).
- The script takes the files tracked by git (minus `DEPLOY_EXCLUDE`: `.github/`, `infra/`,
  `scripts/`, `README.md`, `CLAUDE.md`…), uploads only those whose SHA-256 differs, deletes remote
  files that are not in the repository (except `PROTECTED` patterns, empty for now), then purges the
  pull zone. A guard aborts if more than 25 % of the remote files would be deleted.
- Secrets, in the GitHub Environments `test` and `prod` (values from `tofu output` and the storage
  zone passwords): `BUNNY_STORAGE_ZONE` (the zone **name**, not its id), `BUNNY_STORAGE_PASSWORD`,
  `BUNNY_PULLZONE_ID`. Repository secrets shared by both: `BUNNY_API_KEY`, `BUNNY_STORAGE_ENDPOINT`
  (optional, defaults to `https://storage.bunnycdn.com` = Frankfurt). The workflow checks that the
  storage zone matches the target environment before deploying.
- Locally: export the same variables, then `python3 scripts/deploy.py --dry-run`.
- Plain Python 3, no dependencies.

## Smoke tests

`scripts/smoke_test.py --env test|prod` checks a deployed environment: language home pages and a
deep page per language, root redirect by browser language (302), HTTP→HTTPS, the 301 of every legacy
`/valloire/...` URL listed in `infra/legacy_redirects.json` (404 for unknown ones), `error.html` on
unknown URLs, security headers, and the environment rules (test: `noindex` and analytics blocked;
prod: indexable, analytics allowed). Options: `--expect-repo-content` (every page of `dist/` served
byte-identical, proving upload and purge; run `hugo` first) and `--redirect-domains`
(`lecolroule.fr`, `lecolroule.com`, `lecolroulé.com`, `lecolroulé.fr`, with and without `www`, over
HTTP and HTTPS, must answer 301 to the prod site).

It runs:

- after every real deployment (`deploy.yml`), with `--expect-repo-content`, plus `--redirect-domains`
  for prod;
- after every infrastructure apply (`infra.yml`), on both environments;
- every day at 05:17 UTC (`smoke.yml`), on both environments, plus the redirect domains. A failure
  triggers GitHub's "workflow run failed" e-mail.

Locally: `python3 scripts/smoke_test.py --env prod --redirect-domains`.

## Infrastructure (bunny.net, OpenTofu)

`infra/` describes the bunny.net resources of the site with the official
[`BunnyWay/bunnynet`](https://registry.terraform.io/providers/BunnyWay/bunnynet) provider:

| File | Content |
|---|---|
| `main.tf` | the environments: `module.prod` (`www.lecolroule.fr`), `module.test` (`test.lecolroule.fr`) |
| `modules/site/main.tf` | one environment: storage zone (404 → `/error.html`), pull zone, hostname |
| `modules/site/edgerules.tf` | edge rules: security headers, root redirect, FR/EN rewrites |
| `dns.tf` | DNS records `www` and `test` in the `lecolroule.fr` zone at Infomaniak (rest of the zone is managed by hand) |
| `encryption.tf` | state/plan encryption (AES-GCM, key derived from a passphrase) |
| `secrets.env` | Proton Pass **references** to the secrets (no secret values) |

Environments are named `prod` and `test`. The module option `layout` selects the edge rules:
`legacy` (single page per language under `/valloire/`, rewrites to `indexfr.html`/`indexen.html`)
or `hugo` (one page per URL under `/<lang>/`, root redirected with a 302 by `Accept-Language`,
301 from the legacy URLs listed in `infra/legacy_redirects.json`). During the Hugo migration,
`test` uses `hugo` and `prod` stays on `legacy`. `test` is a staging copy of the site used to validate a
version before deploying it to `prod`: it sends `X-Robots-Tag: noindex, nofollow` and its
Content-Security-Policy blocks analytics (Google Analytics, Mouseflow) so that stats stay clean.
Its DNS record is created by `dns.tf` before the environment, so that the TLS certificate can be
issued in the same apply.
`tofu output` shows, per environment, the storage zone name, the pull zone id and the
bunny.net hostname to use as DNS CNAME target.

Other zones of the bunny.net account belong to other projects and are not managed here.

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

## Planned work

1. Clean up unused files now that automated deployment is validated.
2. Rework: a single HTML template + FR/EN translation files, blog posts as data, build to `dist/` in CI.
3. SEO: one URL = its own content (today every URL serves the whole page → duplicate content).
4. PR checks for the website (broken links, FR/EN parity).
5. Cache: purge only changed URLs instead of the whole pull zone, and version assets (hash or
   semver in the path, e.g. `main.3f2a1c.css`) so they never need purging; only HTML pages would.
6. Move the web redirections (apex `lecolroule.fr`, `lecolroule.com`, `lecolroulé.com`,
   `lecolroulé.fr` → `https://www.lecolroule.fr/`) from Infomaniak to a bunny.net pull zone managed
   in `infra/`, with their DNS records (apex domains cannot be CNAMEs at Infomaniak).
