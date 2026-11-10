# Resources were moved from the root module into module.prod (modules/site).
# These blocks only update the state; they can be removed once applied.

moved {
  from = bunnynet_storage_zone.site
  to   = module.prod.bunnynet_storage_zone.this
}

moved {
  from = bunnynet_pullzone.site
  to   = module.prod.bunnynet_pullzone.this
}

moved {
  from = bunnynet_pullzone_hostname.www
  to   = module.prod.bunnynet_pullzone_hostname.this
}

moved {
  from = bunnynet_pullzone_edgerule.cors_header
  to   = module.prod.bunnynet_pullzone_edgerule.security_headers
}

moved {
  from = bunnynet_pullzone_edgerule.redirect_root
  to   = module.prod.bunnynet_pullzone_edgerule.redirect_root
}

moved {
  from = bunnynet_pullzone_edgerule.rewrite_en
  to   = module.prod.bunnynet_pullzone_edgerule.rewrite_en
}

moved {
  from = bunnynet_pullzone_edgerule.rewrite_fr
  to   = module.prod.bunnynet_pullzone_edgerule.rewrite_fr
}
