# The provider requires every trigger/action object to carry all its
# parameters; these defaults fill the ones a rule does not use.
locals {
  trigger_defaults = { parameter1 = null, parameter2 = null }
  action_defaults  = { parameter1 = null, parameter2 = null, parameter3 = null }
}

# Edge rules of the pull zone. Lower priority values run first.

# Security headers on every GET response.
resource "bunnynet_pullzone_edgerule" "cors_header" {
  pullzone    = bunnynet_pullzone.site.id
  description = "Response Headers"
  enabled     = true
  priority    = 0
  match_type  = "MatchAny"

  triggers = [for t in [{
    type       = "RequestMethod"
    match_type = "MatchAny"
    patterns   = ["GET"]
  }] : merge(local.trigger_defaults, t)]

  actions = [for a in [
    {
      type       = "SetResponseHeader"
      parameter1 = "Access-Control-Allow-Origin"
      parameter2 = "https://www.lecolroule.fr, *.mouseflow.com"
    },
    {
      type       = "SetResponseHeader"
      parameter1 = "Strict-Transport-Security"
      parameter2 = "max-age= 63072000; includeSubdomains; preload"
    },
    {
      type       = "SetResponseHeader"
      parameter1 = "Content-Security-Policy"
      parameter2 = join("; ", [
        "default-src 'self' https://www.google.com https://*.mouseflow.com https://sibforms.com https://*.sibforms.com",
        "img-src 'self' data: https://*.google-analytics.com https://*.mouseflow.com https://*.analytics.google.com",
        "connect-src 'self' data: https://*.google-analytics.com https://*.analytics.google.com https://*.mouseflow.com https://www.google.com https://sibforms.com https://*.sibforms.com",
        "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://*.google-analytics.com https://*.mouseflow.com https://www.google.com https://www.gstatic.com https://sibforms.com https://*.sibforms.com",
        "style-src 'self' 'unsafe-inline' https://fonts.bunny.net https://sibforms.com https://*.sibforms.com",
        "font-src 'self' https://assets.brevo.com https://fonts.bunny.net",
        "object-src 'none'",
      ])
    },
    {
      type       = "SetResponseHeader"
      parameter1 = "X-Content-Type-Options"
      parameter2 = "nosniff"
    },
    {
      type       = "SetResponseHeader"
      parameter1 = "X-Frame-Options"
      parameter2 = "DENY"
    },
    {
      type       = "SetResponseHeader"
      parameter1 = "X-XSS-Protection"
      parameter2 = "1; mode=block"
    },
    {
      type       = "SetResponseHeader"
      parameter1 = "Referrer-Policy"
      parameter2 = "same-origin"
    },
  ] : merge(local.action_defaults, a)]
}

# https://www.lecolroule.fr/ -> /valloire/
resource "bunnynet_pullzone_edgerule" "redirect_root" {
  pullzone    = bunnynet_pullzone.site.id
  description = ""
  enabled     = true
  priority    = 1
  match_type  = "MatchAny"

  triggers = [for t in [{
    type       = "Url"
    match_type = "MatchAny"
    patterns   = ["https://www.lecolroule.fr/"]
  }] : merge(local.trigger_defaults, t)]

  actions = [for a in [{
    type       = "Redirect"
    parameter1 = "https://www.lecolroule.fr/valloire/"
    parameter2 = "301"
  }] : merge(local.action_defaults, a)]
}

# /valloire/en/* is served by the English page (client-side routing in main.js).
resource "bunnynet_pullzone_edgerule" "rewrite_en" {
  pullzone    = bunnynet_pullzone.site.id
  description = "Default EN Page"
  enabled     = true
  priority    = 2
  match_type  = "MatchAny"

  triggers = [for t in [{
    type       = "Url"
    match_type = "MatchAny"
    patterns   = ["https://www.lecolroule.fr/valloire/en/*"]
  }] : merge(local.trigger_defaults, t)]

  actions = [for a in [{
    type       = "OriginUrl"
    parameter1 = "https://www.lecolroule.fr/valloire/indexen.html"
  }] : merge(local.action_defaults, a)]
}

# Any other /valloire/* path is served by the French page, except index* files
# and the English section.
resource "bunnynet_pullzone_edgerule" "rewrite_fr" {
  pullzone    = bunnynet_pullzone.site.id
  description = "Default FR Page"
  enabled     = true
  priority    = 3
  match_type  = "MatchAll"

  triggers = [for t in [
    {
      type       = "Url"
      match_type = "MatchAny"
      patterns   = ["https://www.lecolroule.fr/valloire/*"]
    },
    {
      type       = "Url"
      match_type = "MatchNone"
      patterns   = ["https://www.lecolroule.fr/valloire/index*", "https://www.lecolroule.fr/valloire/en/*"]
    },
  ] : merge(local.trigger_defaults, t)]

  actions = [for a in [{
    type       = "OriginUrl"
    parameter1 = "https://www.lecolroule.fr/valloire/indexfr.html"
  }] : merge(local.action_defaults, a)]
}
