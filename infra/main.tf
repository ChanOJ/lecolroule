# The website environments. Each one is a full copy of the bunny.net setup
# (storage zone, pull zone, hostname, edge rules), see modules/site.

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

  name      = "le-col-roule-test"
  hostname  = "test.lecolroule.fr"
  noindex   = true
  analytics = false
}

output "prod" {
  value = module.prod
}

output "test" {
  value = module.test
}
