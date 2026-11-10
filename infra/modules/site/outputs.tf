output "storage_zone_name" {
  description = "Storage zone name (BUNNY_STORAGE_ZONE for scripts/deploy.py)."
  value       = bunnynet_storage_zone.this.name
}

output "pullzone_id" {
  description = "Pull zone id (BUNNY_PULLZONE_ID for scripts/deploy.py)."
  value       = bunnynet_pullzone.this.id
}

output "cdn_hostname" {
  description = "bunny.net system hostname, target of the DNS CNAME record."
  value       = "${bunnynet_pullzone.this.name}.${bunnynet_pullzone.this.cdn_domain}"
}
