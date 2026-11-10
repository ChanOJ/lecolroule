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
