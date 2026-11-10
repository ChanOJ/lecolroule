# CDN in front of the storage zone, serving https://www.lecolroule.fr
resource "bunnynet_pullzone" "site" {
  name = "le-col-roule"

  origin {
    type        = "StorageZone"
    storagezone = bunnynet_storage_zone.site.id
  }

  routing {
    tier  = "Standard"
    zones = ["EU"]
  }

  cors_enabled    = true
  cors_extensions = ["css", "eot", "gif", "jpeg", "jpg", "js", "mp3", "mp4", "mpeg", "png", "svg", "ttf", "webm", "webp", "woff", "woff2"]

  block_no_referer = true
  log_anonymized   = true

  # TLS security level: "Compatible" drops the weak RSA/CBC cipher suites and
  # TLS 1.0/1.1 allowed by "Legacy", while keeping older-but-maintained clients.
  tls_level = "Compatible"

  # Deprecated TLS 1.0 / 1.1 stay disabled. Only effective with tls_level
  # "Legacy"; kept so that switching back to Legacy does not re-enable them.
  tls_support = []
}

resource "bunnynet_pullzone_hostname" "www" {
  pullzone    = bunnynet_pullzone.site.id
  name        = "www.lecolroule.fr"
  tls_enabled = true
  force_ssl   = true
}
