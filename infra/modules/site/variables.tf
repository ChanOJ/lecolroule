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
