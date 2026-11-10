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
module "test" {
  source = "./modules/site"

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
