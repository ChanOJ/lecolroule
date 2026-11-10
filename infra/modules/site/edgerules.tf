# The provider requires every trigger/action object to carry all its
# parameters; these defaults fill the ones a rule does not use.
locals {
  trigger_defaults = { parameter1 = null, parameter2 = null }
  action_defaults  = { parameter1 = null, parameter2 = null, parameter3 = null }

  base_url = "https://${var.hostname}"

  # Content-Security-Policy, one list of sources per directive.
  # Analytics sources are dropped when var.analytics is false.
  analytics_sources = [
    "https://www.googletagmanager.com",
    "https://*.google-analytics.com",
    "https://*.analytics.google.com",
    "https://*.mouseflow.com",
  ]
  csp_directives = [
    ["default-src", "'self'", "https://www.google.com", "https://*.mouseflow.com", "https://sibforms.com", "https://*.sibforms.com"],
    ["img-src", "'self'", "data:", "https://*.google-analytics.com", "https://*.mouseflow.com", "https://*.analytics.google.com"],
    ["connect-src", "'self'", "data:", "https://*.google-analytics.com", "https://*.analytics.google.com", "https://*.mouseflow.com", "https://www.google.com", "https://sibforms.com", "https://*.sibforms.com"],
    ["script-src", "'self'", "'unsafe-inline'", "https://www.googletagmanager.com", "https://*.google-analytics.com", "https://*.mouseflow.com", "https://www.google.com", "https://www.gstatic.com", "https://sibforms.com", "https://*.sibforms.com"],
    ["style-src", "'self'", "'unsafe-inline'", "https://fonts.bunny.net", "https://sibforms.com", "https://*.sibforms.com"],
    ["font-src", "'self'", "https://assets.brevo.com", "https://fonts.bunny.net"],
    ["object-src", "'none'"],
  ]
  csp = join("; ", [
    for d in local.csp_directives :
    join(" ", [for s in d : s if var.analytics || !contains(local.analytics_sources, s)])
  ])
}

# Edge rules of the pull zone. Lower priority values run first.

# Security headers on every GET response (plus X-Robots-Tag when var.noindex).
resource "bunnynet_pullzone_edgerule" "security_headers" {
  pullzone    = bunnynet_pullzone.this.id
  description = "Response Headers"
  enabled     = true
  priority    = 0
  match_type  = "MatchAny"

  triggers = [for t in [{
    type       = "RequestMethod"
    match_type = "MatchAny"
    patterns   = ["GET"]
  }] : merge(local.trigger_defaults, t)]

  actions = [for a in concat([
    {
      type       = "SetResponseHeader"
      parameter1 = "Access-Control-Allow-Origin"
      parameter2 = "${local.base_url}, *.mouseflow.com"
    },
    {
      type       = "SetResponseHeader"
      parameter1 = "Strict-Transport-Security"
      parameter2 = "max-age= 63072000; includeSubdomains; preload"
    },
    {
      type       = "SetResponseHeader"
      parameter1 = "Content-Security-Policy"
      parameter2 = local.csp
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
    ], var.noindex ? [{
      type       = "SetResponseHeader"
      parameter1 = "X-Robots-Tag"
      parameter2 = "noindex, nofollow"
  }] : []) : merge(local.action_defaults, a)]
}

# ---------------------------------------------------------------- legacy layout

# Root URL -> /valloire/
resource "bunnynet_pullzone_edgerule" "redirect_root" {
  count = var.layout == "legacy" ? 1 : 0

  pullzone    = bunnynet_pullzone.this.id
  description = ""
  enabled     = true
  priority    = 1
  match_type  = "MatchAny"

  triggers = [for t in [{
    type       = "Url"
    match_type = "MatchAny"
    patterns   = ["${local.base_url}/"]
  }] : merge(local.trigger_defaults, t)]

  actions = [for a in [{
    type       = "Redirect"
    parameter1 = "${local.base_url}/valloire/"
    parameter2 = "301"
  }] : merge(local.action_defaults, a)]
}

# /valloire/en/* is served by the English page (client-side routing in main.js).
resource "bunnynet_pullzone_edgerule" "rewrite_en" {
  count = var.layout == "legacy" ? 1 : 0

  pullzone    = bunnynet_pullzone.this.id
  description = "Default EN Page"
  enabled     = true
  priority    = 2
  match_type  = "MatchAny"

  triggers = [for t in [{
    type       = "Url"
    match_type = "MatchAny"
    patterns   = ["${local.base_url}/valloire/en/*"]
  }] : merge(local.trigger_defaults, t)]

  actions = [for a in [{
    type       = "OriginUrl"
    parameter1 = "${local.base_url}/valloire/indexen.html"
  }] : merge(local.action_defaults, a)]
}

# Any other /valloire/* path is served by the French page, except index* files
# and the English section.
resource "bunnynet_pullzone_edgerule" "rewrite_fr" {
  count = var.layout == "legacy" ? 1 : 0

  pullzone    = bunnynet_pullzone.this.id
  description = "Default FR Page"
  enabled     = true
  priority    = 3
  match_type  = "MatchAll"

  triggers = [for t in [
    {
      type       = "Url"
      match_type = "MatchAny"
      patterns   = ["${local.base_url}/valloire/*"]
    },
    {
      type       = "Url"
      match_type = "MatchNone"
      patterns   = ["${local.base_url}/valloire/index*", "${local.base_url}/valloire/en/*"]
    },
  ] : merge(local.trigger_defaults, t)]

  actions = [for a in [{
    type       = "OriginUrl"
    parameter1 = "${local.base_url}/valloire/indexfr.html"
  }] : merge(local.action_defaults, a)]
}

# The legacy rules became conditional (count): keep the existing ones.
moved {
  from = bunnynet_pullzone_edgerule.redirect_root
  to   = bunnynet_pullzone_edgerule.redirect_root[0]
}

moved {
  from = bunnynet_pullzone_edgerule.rewrite_en
  to   = bunnynet_pullzone_edgerule.rewrite_en[0]
}

moved {
  from = bunnynet_pullzone_edgerule.rewrite_fr
  to   = bunnynet_pullzone_edgerule.rewrite_fr[0]
}

# ------------------------------------------------------------------ hugo layout

locals {
  hugo                = var.layout == "hugo"
  other_languages     = sort([for l in var.languages : l if l != var.default_language])
  redirect_languages  = local.hugo ? toset(local.other_languages) : toset([])
  accept_language_any = [for l in local.other_languages : "${l}*"]

  # bunny.net requires a unique priority (order index) per rule of a pull zone:
  # 0 security headers, 1-8 root language rules, 9 root default language,
  # 10.. legacy redirects. Fixed slots avoid transient collisions when rules
  # are added or removed.
  root_language_priority   = { for i, l in local.other_languages : l => 1 + i }
  root_default_priority    = 9
  legacy_redirect_priority = { for i, k in sort(keys(var.legacy_redirects)) : k => 10 + i }
}

# Root URL -> home page of the browser's preferred language (302: depends on
# the visitor). Matched on the start of Accept-Language, e.g. "fr-FR,fr;q=0.9".
resource "bunnynet_pullzone_edgerule" "root_language" {
  for_each = local.redirect_languages

  pullzone    = bunnynet_pullzone.this.id
  description = "Root to /${each.key}/"
  enabled     = true
  priority    = local.root_language_priority[each.key]
  match_type  = "MatchAll"

  triggers = [for t in [
    {
      type       = "Url"
      match_type = "MatchAny"
      patterns   = ["${local.base_url}/"]
    },
    {
      type       = "RequestHeader"
      match_type = "MatchAny"
      parameter1 = "Accept-Language"
      patterns   = ["${each.key}*"]
    },
  ] : merge(local.trigger_defaults, t)]

  actions = [for a in [{
    type       = "Redirect"
    parameter1 = "${local.base_url}/${each.key}/"
    parameter2 = "302"
  }] : merge(local.action_defaults, a)]
}

# Root URL -> default language when the browser prefers none of the others
# (also crawlers, which usually send no Accept-Language).
resource "bunnynet_pullzone_edgerule" "root_default_language" {
  count = local.hugo ? 1 : 0

  pullzone    = bunnynet_pullzone.this.id
  description = "Root to /${var.default_language}/"
  enabled     = true
  priority    = local.root_default_priority
  match_type  = "MatchAll"

  triggers = [for t in [
    {
      type       = "Url"
      match_type = "MatchAny"
      patterns   = ["${local.base_url}/"]
    },
    {
      type       = "RequestHeader"
      match_type = "MatchNone"
      parameter1 = "Accept-Language"
      patterns   = local.accept_language_any
    },
  ] : merge(local.trigger_defaults, t)]

  actions = [for a in [{
    type       = "Redirect"
    parameter1 = "${local.base_url}/${var.default_language}/"
    parameter2 = "302"
  }] : merge(local.action_defaults, a)]
}

# Legacy URLs (/valloire/...) -> their new address, permanently. Any other
# legacy URL ends in the storage zone 404 (error.html).
resource "bunnynet_pullzone_edgerule" "legacy_redirect" {
  for_each = local.hugo ? var.legacy_redirects : {}

  pullzone    = bunnynet_pullzone.this.id
  description = "Legacy URLs to ${each.key}"
  enabled     = true
  priority    = local.legacy_redirect_priority[each.key]
  match_type  = "MatchAny"

  triggers = [for t in [{
    type       = "Url"
    match_type = "MatchAny"
    # Each legacy path, with or without a query string.
    patterns = flatten([for old in each.value : ["${local.base_url}${old}", "${local.base_url}${old}?*"]])
  }] : merge(local.trigger_defaults, t)]

  actions = [for a in [{
    type       = "Redirect"
    parameter1 = "${local.base_url}${each.key}"
    parameter2 = "301"
  }] : merge(local.action_defaults, a)]
}
