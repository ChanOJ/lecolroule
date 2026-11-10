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
  ]
  csp_directives = [
    ["default-src", "'self'", "https://www.google.com", "https://sibforms.com", "https://*.sibforms.com"],
    ["img-src", "'self'", "data:", "https://*.google-analytics.com", "https://*.analytics.google.com"],
    ["connect-src", "'self'", "data:", "https://*.google-analytics.com", "https://*.analytics.google.com", "https://www.google.com", "https://sibforms.com", "https://*.sibforms.com"],
    ["script-src", "'self'", "'unsafe-inline'", "https://www.googletagmanager.com", "https://*.google-analytics.com", "https://www.google.com", "https://www.gstatic.com", "https://sibforms.com", "https://*.sibforms.com"],
    ["style-src", "'self'", "'unsafe-inline'", "https://sibforms.com", "https://*.sibforms.com"],
    ["font-src", "'self'", "https://assets.brevo.com"],
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
      parameter2 = local.base_url
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

# The root URL (/) is not redirected here: it serves the root page of the
# site (layouts/alias.html), whose script picks the visitor's language. Edge
# rules split Accept-Language at commas, so they cannot tell which language a
# browser prefers.

locals {
  hugo = var.layout == "hugo"
  # bunny.net requires a unique priority (order index) per rule of a pull zone:
  # 0 security headers, 1-3 legacy layout rules, 10.. legacy redirects,
  # 100 page cache. Fixed, disjoint slots avoid collisions while rules are
  # added and removed in the same apply; moving a rule to the slot of another
  # one in the same apply fails ("Order index must be unique").
  legacy_redirect_priority = { for i, k in sort(keys(var.legacy_redirects)) : k => 10 + i }
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

  # Exact legacy URLs only: in bunny.net patterns "?" is a single-character
  # wildcard (and "*" any string), so "/valloire?*" would match every legacy
  # URL. At most 5 patterns per trigger: split them into several triggers
  # (the rule matches if any of them does).
  triggers = [for chunk in chunklist([for old in each.value : "${local.base_url}${old}"], 5) : merge(local.trigger_defaults, {
    type       = "Url"
    match_type = "MatchAny"
    patterns   = chunk
  })]

  actions = [for a in [{
    type       = "Redirect"
    parameter1 = "${local.base_url}${each.key}"
    parameter2 = "301"
  }] : merge(local.action_defaults, a)]
}

# ------------------------------------------------------------------- caching

# Pages: short browser cache ("cdn" policy), whatever the origin says, so that
# visitors get a new version quickly after a deployment. Fingerprinted assets
# keep the long cache of the origin.
locals {
  page_patterns = concat(
    ["${local.base_url}/", "${local.base_url}/*/", "${local.base_url}/*.html", "${local.base_url}/*.xml", "${local.base_url}/*.txt"],
    # Legacy layout: pages have no extension and no trailing slash.
    var.layout == "legacy" ? ["${local.base_url}/valloire/*"] : [],
  )
}

resource "bunnynet_pullzone_edgerule" "page_browser_cache" {
  count = var.cache == "cdn" ? 1 : 0

  pullzone    = bunnynet_pullzone.this.id
  description = "Pages: browser cache ${var.html_browser_cache_seconds} s"
  enabled     = true
  # Own slot, clear of the layout rules (1-3 legacy, 1-9 and 10+ hugo).
  priority   = 100
  match_type = "MatchAny"

  triggers = [for chunk in chunklist(local.page_patterns, 5) : merge(local.trigger_defaults, {
    type       = "Url"
    match_type = "MatchAny"
    patterns   = chunk
  })]

  actions = [for a in [{
    type       = "OverrideBrowserCacheTime"
    parameter1 = tostring(var.html_browser_cache_seconds)
  }] : merge(local.action_defaults, a)]
}
