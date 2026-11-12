# DNS records of the website in the lecolroule.fr zone, hosted at Infomaniak.
#
# Only the records pointing to bunny.net and the Google Search Console
# verification are managed here. The rest of the zone
# stays managed in the Infomaniak manager: mail (MX, SPF, DKIM, DMARC, BIMI) and
# the apex A/AAAA/TXT records that belong to Infomaniak's web redirection
# (lecolroule.fr -> https://www.lecolroule.fr/valloire/). The zone itself is
# never managed, so that no plan can ever delete it.

locals {
  zone      = "lecolroule.fr"
  test_name = "le-col-roule-test"
}

resource "infomaniak_record" "www" {
  zone_fqdn = local.zone
  type      = "CNAME"
  source    = "www"
  target    = module.prod.cdn_hostname
  ttl       = 3600

  lifecycle {
    prevent_destroy = true
  }
}

# Target computed from the pull zone name (not from module.test, which depends
# on this record): bunny.net system hostnames are "<pull zone name>.b-cdn.net".
resource "infomaniak_record" "test" {
  zone_fqdn = local.zone
  type      = "CNAME"
  source    = "test"
  target    = "${local.test_name}.b-cdn.net"
  ttl       = 3600
}

# Google Search Console: proof of ownership of the domain (also in
# dns_bunny.tf, for when the domain is delegated to Bunny).
resource "infomaniak_record" "google_site_verification" {
  zone_fqdn = local.zone
  type      = "TXT"
  source    = "."
  target    = "google-site-verification=D3Y2KhznVBAMJY05TDKwWZiBqteuLRvoufknwr0mFDc"
  ttl       = 3600
}
