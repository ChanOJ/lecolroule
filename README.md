# Le Col Roulé — static website

Showcase website of a holiday rental in Valloire: https://www.lecolroule.fr/valloire/
Built on the "Dimension" theme by HTML5 UP (jQuery), hosted on bunny.net (Storage Zone + Pull Zone).
DNS is managed at Infomaniak (not in this repository).

## Layout

- `valloire/indexfr.html`, `valloire/indexen.html`: **all the content** of the site, one page per
  language, maintained by hand (no template yet). Any content change must be made in both files.
- `assets/`: theme CSS/JS/webfonts. `assets/js/main.js` holds the client-side routing.
- `images/`: images used by the pages (`images/blog/` for blog posts, `images/favicon/`).
- `error.html`: error page (carries `<meta name="error" content="true">`, read by main.js).
- `index.html` (root): placeholder; the root URL is redirected to `/valloire/` by an edge rule.
- `robots.txt`, `sitemap.xml`, `favicon.ico`, `bimi.svg`: served as is.
- `scripts/deploy.py`: deployment to bunny.net (see below).
- `scripts/smoke_test.py`: checks of a deployed environment (see below).
- `infra/`: bunny.net configuration as code (OpenTofu, see below).

## How it works (do not break)

- Each page contains several `<article id="…">`. `main.js` reads `location.pathname`, strips
  `/valloire/` then a `xx/` language prefix, and shows the article with the matching id
  (e.g. `/valloire/appartement`, `/valloire/en/apartment`). Ids are **translated**:
  `appartement`↔`apartment`, `appartement-commerces`↔`apartment-shops`,
  `appartement-trajet`↔`apartment-route`, `appartement-ski`↔`ski-apartment`,
  `appartement-rando-velo`↔`biking-hiking-apartment`, `contact-reservation`↔`booking-contact`.
  Internal links are relative (`./slug`) and must match an article id of the same page.
- An unknown id redirects to `/404.html` (a file that intentionally does not exist). Every 404 is
  answered with `/error.html`, through the storage zone "404 File path" setting: that file must not
  be renamed or removed.
- URL mapping (`/valloire/*` → `indexfr.html`, `/valloire/en/*` → `indexen.html`, root → `/valloire/`)
  is done by **pull zone edge rules**, defined in `infra/modules/site/edgerules.tf`.

## Deployment

The repository only holds sources; nothing generated is committed (`dist/` is ignored).
Files are deployed as is, at the same path, to the storage zone.

- `.github/workflows/deploy.yml` runs `scripts/deploy.py`:
  - on push to `main` (except infra-only or Markdown-only changes): deploys to **test**
    (https://test.lecolroule.fr/valloire/);
  - manually (Actions → Deploy website → Run workflow): deploys to **test** or **prod**, as a dry run
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

`scripts/smoke_test.py --env test|prod` checks a deployed environment: FR/EN pages and deep links,
root and HTTP→HTTPS redirects, `error.html` on unknown URLs, security headers, and the environment
rules (test: `noindex` and analytics blocked; prod: indexable, analytics allowed). Options:
`--expect-repo-content` (served HTML byte-identical to the checkout, proving upload and purge) and
`--redirect-domains` (`lecolroule.fr`, `lecolroule.com`, `lecolroulé.com`, `lecolroulé.fr`, with and
without `www`, over HTTP and HTTPS, must answer 301 to `https://www.lecolroule.fr/valloire/`).

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

Environments are named `prod` and `test`. `test` is a staging copy of the site used to validate a
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
- manual run (Actions → Infrastructure (OpenTofu) → Run workflow → `apply`, from `main`): plan,
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
