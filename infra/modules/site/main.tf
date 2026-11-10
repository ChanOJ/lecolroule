# One environment of the website: a storage zone holding the files, a pull zone
# (CDN) in front of it, its public hostname and its edge rules (edgerules.tf).

# Storage zone holding the website files (deployed by scripts/deploy.py).
resource "bunnynet_storage_zone" "this" {
  name                = var.name
  region              = "DE"
  replication_regions = var.replication_regions
  zone_tier           = "Standard"

  # Every 404 is answered with this file.
  custom_404_file_path = var.not_found_page
  rewrite_404_to_200   = false
}

resource "bunnynet_pullzone" "this" {
  name = var.name

  origin {
    type        = "StorageZone"
    storagezone = bunnynet_storage_zone.this.id
  }

  routing {
    tier  = "Standard"
    zones = ["EU"]
  }

  cors_enabled    = true
  cors_extensions = ["css", "eot", "gif", "jpeg", "jpg", "js", "mp3", "mp4", "mpeg", "png", "svg", "ttf", "webm", "webp", "woff", "woff2"]

  block_no_referer = true
  log_anonymized   = true

  # Cache times: -1 = as told by the origin (storage zone), 0 = no cache.
  cache_expiration_time         = var.cache == "none" ? 0 : -1
  cache_expiration_time_browser = var.cache == "none" ? 0 : -1

  # TLS security level: "Compatible" drops the weak RSA/CBC cipher suites and
  # TLS 1.0/1.1 allowed by "Legacy", while keeping older-but-maintained clients.
  tls_level = "Compatible"

  # Deprecated TLS 1.0 / 1.1 stay disabled. Only effective with tls_level
  # "Legacy"; kept so that switching back to Legacy does not re-enable them.
  tls_support = []
}

resource "bunnynet_pullzone_hostname" "this" {
  pullzone    = bunnynet_pullzone.this.id
  name        = var.hostname
  tls_enabled = true
  force_ssl   = true
}
