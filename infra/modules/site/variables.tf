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
  description = "Allow analytics (Google Analytics, Mouseflow) in the Content-Security-Policy. When false, their scripts are blocked by the browser."
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

variable "languages" {
  description = "Site languages (\"hugo\" layout): prefixes of the language home pages, /<lang>/."
  type        = list(string)
  default     = ["fr", "en"]
}

variable "default_language" {
  description = "Language the root URL redirects to when the browser prefers none of var.languages."
  type        = string
  default     = "en"
}

variable "legacy_redirects" {
  description = "\"hugo\" layout: new path => list of legacy paths answered with a 301 to it."
  type        = map(list(string))
  default     = {}
}
