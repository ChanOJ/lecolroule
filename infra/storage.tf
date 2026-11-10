# Storage zone holding the website files (deployed by scripts/deploy.py).
resource "bunnynet_storage_zone" "site" {
  name                = "le-col-roule"
  region              = "DE"
  replication_regions = ["UK"]
  zone_tier           = "Standard"

  # Every 404 is answered with this file (see error.html and assets/js/main.js).
  custom_404_file_path = "/error.html"
  rewrite_404_to_200   = false
}
