@README.md

## Instructions for Claude

Project documentation lives in `README.md` (imported above): keep it up to date in the same pull
request as the change it describes, rather than this file. Do not start the "Planned work" items
of the README without an explicit request.

- **Infrastructure**: never run `tofu apply` (nor the apply workflow). Run the plan locally
  (`cd infra && pass-cli run --env-file secrets.env -- tofu plan`), open the PR, and let the owner
  merge and run the apply. Say when a change only works, or a check only passes, after the apply.
- **Build like the deployment workflow** before proposing a site change: `hugo --panicOnWarning`
  (warnings such as deprecations fail the CI), plus `python3 scripts/textures.py --check` and
  `python3 scripts/models.py --check` for the 3D visit.
- **Deployments**: a merge to `main` deploys to test; prod is deployed by the owner (deploy
  workflow, `prod`). Remind them after a merge that changes the site.
- **Content-Security-Policy**: no inline script or event handler, scripts in files. No third-party
  request that would need the visitor's consent (cookies, fonts or scripts from a CDN, video
  embeds loaded at once): the site has no consent banner and must not need one.
- **Photos**: of the flat only, never people; `3d-sources/` is never committed.
- **Languages**: French is the reference; the other languages follow it, with their deliberate
  differences listed in `translationNotes` (README, "Editing content"; inclusive language:
  README, "Inclusive language").
