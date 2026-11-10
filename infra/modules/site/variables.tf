variable "name" {
  description = "Name of the storage zone and of the pull zone (e.g. le-col-roule)."
  type        = string
}

variable "hostname" {
  description = "Public hostname of the site (e.g. www.lecolroule.fr)."
  type        = string
}

variable "replication_regions" {
  description = "Storage zone replication regions, in addition to the main region (DE)."
  type        = list(string)
  default     = []
}

variable "noindex" {
  description = "Send X-Robots-Tag: noindex, nofollow so that search engines ignore this environment."
  type        = bool
  default     = false
}

variable "analytics" {
  description = "Allow analytics (Google Analytics) in the Content-Security-Policy. When false, their scripts are blocked by the browser."
  type        = bool
  default     = true
}

variable "layout" {
  description = <<-EOT
    Site layout the edge rules serve:
    - "legacy": single page per language under /valloire/ (rewrites to indexfr.html / indexen.html);
    - "hugo": one page per URL under /<lang>/ (root redirected by browser language, 301 from the
      legacy URLs listed in legacy_redirects).
  EOT
  type        = string
  default     = "legacy"

  validation {
    condition     = contains(["legacy", "hugo"], var.layout)
    error_message = "layout must be \"legacy\" or \"hugo\"."
  }
}

variable "legacy_redirects" {
  description = "\"hugo\" layout: new path => list of legacy paths answered with a 301 to it."
  type        = map(list(string))
  default     = {}
}

variable "cache" {
  description = <<-EOT
    Caching policy:
    - "cdn": the CDN caches every file (purged by scripts/deploy.py on each
      deployment); browsers cache files as told by the origin (long), except
      pages (HTML, sitemap, robots.txt) cached html_browser_cache_seconds only.
      Long browser caching is safe for stylesheets, scripts and images because
      their URLs carry a content fingerprint (Hugo).
    - "none": nothing is cached, neither by the CDN nor by browsers (test).
  EOT
  type        = string
  default     = "cdn"

  validation {
    condition     = contains(["cdn", "none"], var.cache)
    error_message = "cache must be \"cdn\" or \"none\"."
  }
}

variable "html_browser_cache_seconds" {
  description = "\"cdn\" cache: browser cache time of pages, so that a new version is seen quickly."
  type        = number
  default     = 300
}

variable "not_found_page" {
  description = "File of the storage zone answered for every 404 (\"404 File path\" setting)."
  type        = string
  default     = "/error.html"
}
