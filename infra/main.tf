locals {
  # Legacy /valloire/... URLs and their new address (also used by scripts/smoke_test.py).
  legacy_redirects = { for k, v in jsondecode(file("${path.module}/legacy_redirects.json")) : k => v if !startswith(k, "_") }
}

# The website environments. Each one is a full copy of the bunny.net setup
# (storage zone, pull zone, hostname, edge rules), see modules/site, plus its
# DNS record in dns.tf.

module "prod" {
  source = "./modules/site"

  name                = "le-col-roule"
  hostname            = "www.lecolroule.fr"
  replication_regions = ["UK"]
}

# Staging environment: validate a version here before deploying it to prod.
# Not indexed by search engines, analytics blocked so that stats stay clean.
# Already on the Hugo layout (one page per URL, branch hugo-site) while prod
# keeps the legacy single-page layout until the switch.
module "test" {
  source = "./modules/site"

  layout           = "hugo"
  legacy_redirects = local.legacy_redirects

  name      = local.test_name
  hostname  = "test.lecolroule.fr"
  noindex   = true
  analytics = false

  # The TLS certificate can only be issued once the hostname resolves to bunny.net.
  depends_on = [infomaniak_record.test]
}

output "prod" {
  value = module.prod
}

output "test" {
  value = module.test
}
