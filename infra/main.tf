# The website environments. Each one is a full copy of the bunny.net setup
# (storage zone, pull zone, hostname, edge rules), see modules/site.

module "prod" {
  source = "./modules/site"

  name                = "le-col-roule"
  hostname            = "www.lecolroule.fr"
  replication_regions = ["UK"]
}

output "prod" {
  value = module.prod
}
