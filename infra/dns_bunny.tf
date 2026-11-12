# DNS of the 4 domains at Bunny DNS, and the redirection of the alternative
# domains to the site. Infomaniak stays the registrar: the name servers and the
# DNSSEC DS record of each domain are set there by hand (README.md, "DNS").
#
# Migration (README.md, "DNS"): every zone is created here and filled like the
# Infomaniak one, but has no effect until the domain is delegated to Bunny.
# The state of each domain is in local.dns_domains:
#   "infomaniak": delegated to Infomaniak (Bunny zone ready, unused);
#   "bunny":      delegated to Bunny: TLS certificates of its redirections;
#   "dnssec":     same, plus Bunny DNSSEC on (DS record published at Infomaniak).

locals {
  # Key: zone name (punycode for "lecolroulé"), value: migration state.
  dns_domains = {
    "lecolroule.fr"         = "infomaniak"
    "lecolroule.com"        = "infomaniak"
    "xn--lecolroul-j4a.com" = "infomaniak" # lecolroulé.com
    "xn--lecolroul-j4a.fr"  = "infomaniak" # lecolroulé.fr
  }
  dns_delegated = { for d, s in local.dns_domains : d => contains(["bunny", "dnssec"], s) }

  # Hostnames redirected to the site: the apex of every domain, www of the
  # alternative ones (www.lecolroule.fr is the site itself).
  redirect_hostnames = merge(
    { for d in keys(local.dns_domains) : d => d },
    { for d in keys(local.dns_domains) : "www.${d}" => d if d != "lecolroule.fr" },
  )

  dns_ttl = 3600
}

resource "bunnynet_dns_zone" "this" {
  for_each = local.dns_domains

  domain         = each.key
  dnssec_enabled = each.value == "dnssec"
  log_anonymized = true

  lifecycle {
    prevent_destroy = true
  }
}

# ----------------------------------------------------------- redirections

# Pull zone answering the alternative hostnames with a 301 to the site. It has
# no content: its origin is the site itself, never reached (edge rule below).
resource "bunnynet_pullzone" "redirects" {
  name = "le-col-roule-redirects"

  origin {
    type = "OriginUrl"
    url  = "https://www.lecolroule.fr"
  }

  routing {
    tier  = "Standard"
    zones = ["EU"]
  }

  log_anonymized = true
  tls_level      = "Compatible"
  tls_support    = []
}

# TLS certificates can only be issued once the domain is delegated to Bunny
# (domain validation): until then, plain HTTP only (it redirects to HTTPS on
# the site anyway).
resource "bunnynet_pullzone_hostname" "redirects" {
  for_each = local.redirect_hostnames

  pullzone    = bunnynet_pullzone.redirects.id
  name        = each.key
  tls_enabled = local.dns_delegated[each.value]
  force_ssl   = false
}

resource "bunnynet_pullzone_edgerule" "redirects" {
  pullzone    = bunnynet_pullzone.redirects.id
  description = "Alternative domains to the site"
  enabled     = true
  priority    = 0
  match_type  = "MatchAny"

  triggers = [{
    type       = "Url"
    match_type = "MatchAny"
    patterns   = ["*"]
    parameter1 = null
    parameter2 = null
  }]

  actions = [{
    type       = "Redirect"
    parameter1 = "https://www.lecolroule.fr/"
    parameter2 = "301"
    parameter3 = null
  }]
}

locals {
  redirects_cdn_hostname = "${bunnynet_pullzone.redirects.name}.${bunnynet_pullzone.redirects.cdn_domain}"
}

# Apex of every domain: CNAME to the redirect pull zone, which Bunny DNS
# flattens at the apex (answers its A/AAAA records). The API refuses the
# provider's "Flatten" type ("Unknown record type").
resource "bunnynet_dns_record" "apex" {
  for_each = local.dns_domains

  zone  = bunnynet_dns_zone.this[each.key].id
  name  = ""
  type  = "CNAME"
  value = local.redirects_cdn_hostname
  ttl   = local.dns_ttl
}

# www of the alternative domains: CNAME to the redirect pull zone.
resource "bunnynet_dns_record" "alt_www" {
  for_each = { for d in keys(local.dns_domains) : d => d if d != "lecolroule.fr" }

  zone  = bunnynet_dns_zone.this[each.key].id
  name  = "www"
  type  = "CNAME"
  value = local.redirects_cdn_hostname
  ttl   = local.dns_ttl
}

# --------------------------------------------------------- lecolroule.fr

locals {
  fr = bunnynet_dns_zone.this["lecolroule.fr"].id

  # Every record of the lecolroule.fr zone other than the apex redirection,
  # copied from Infomaniak. Mail (Proton) and Brevo records: a mistake here
  # breaks the sending or the receiving of e-mails, check them with
  # scripts/dns_compare.py before any delegation change.
  fr_records = {
    www  = { name = "www", type = "CNAME", value = module.prod.cdn_hostname }
    test = { name = "test", type = "CNAME", value = module.test.cdn_hostname }

    mx_1       = { name = "", type = "MX", value = "mail.protonmail.ch", priority = 10 }
    mx_2       = { name = "", type = "MX", value = "mailsec.protonmail.ch", priority = 20 }
    spf        = { name = "", type = "TXT", value = "v=spf1 include:_spf.protonmail.ch include:spf.brevo.com ~all" }
    proton_ver = { name = "", type = "TXT", value = "protonmail-verification=1ff463ee9ba9899bcd03c8f32ba3f09bc32d0e02" }
    brevo_ver  = { name = "", type = "TXT", value = "brevo-code:dbc3dc0cdc742feb4debcec4d4c47478" }
    google_ver = { name = "", type = "TXT", value = "google-site-verification=D3Y2KhznVBAMJY05TDKwWZiBqteuLRvoufknwr0mFDc" }
    dmarc      = { name = "_dmarc", type = "TXT", value = "v=DMARC1; p=reject; rua=mailto:rua@dmarc.brevo.com" }
    bimi       = { name = "default._bimi", type = "TXT", value = "v=BIMI1; l=https://www.lecolroule.fr/bimi.svg" }

    dkim_proton_1 = { name = "protonmail._domainkey", type = "CNAME", value = "protonmail.domainkey.dzqafx6rbctnz7ljm42vpiqk7alnosauz2g4xi5gjv3c6qmhds4ga.domains.proton.ch" }
    dkim_proton_2 = { name = "protonmail2._domainkey", type = "CNAME", value = "protonmail2.domainkey.dzqafx6rbctnz7ljm42vpiqk7alnosauz2g4xi5gjv3c6qmhds4ga.domains.proton.ch" }
    dkim_proton_3 = { name = "protonmail3._domainkey", type = "CNAME", value = "protonmail3.domainkey.dzqafx6rbctnz7ljm42vpiqk7alnosauz2g4xi5gjv3c6qmhds4ga.domains.proton.ch" }
    dkim_brevo_1  = { name = "brevo1._domainkey", type = "CNAME", value = "b1.lecolroule-fr.dkim.brevo.com" }
    dkim_brevo_2  = { name = "brevo2._domainkey", type = "CNAME", value = "b2.lecolroule-fr.dkim.brevo.com" }
  }
}

resource "bunnynet_dns_record" "fr" {
  for_each = { for k, r in local.fr_records : k => merge({ priority = null }, r) }

  zone     = local.fr
  name     = each.value.name
  type     = each.value.type
  value    = each.value.value
  priority = each.value.priority
  ttl      = local.dns_ttl

  lifecycle {
    prevent_destroy = true
  }
}

# ---------------------------------------------------------------- outputs

output "dns" {
  description = "Per domain: Bunny name servers to set at Infomaniak, and the DNSSEC DS record to publish there once DNSSEC is on."
  value = {
    for d, z in bunnynet_dns_zone.this : d => {
      state       = local.dns_domains[d]
      nameservers = [z.nameserver1, z.nameserver2]
      ds = z.dnssec_enabled ? {
        key_tag     = z.dnssec_keytag
        algorithm   = z.dnssec_algorithm
        digest_type = z.dnssec_digest_type
        digest      = z.dnssec_digest
      } : null
    }
  }
}

output "redirects_cdn_hostname" {
  description = "bunny.net hostname of the redirect pull zone."
  value       = local.redirects_cdn_hostname
}
