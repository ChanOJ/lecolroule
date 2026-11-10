# One-off imports, removable once applied.
#
# - www: record created by hand in the Infomaniak manager.
# - test environment: created by a partial apply whose state was not committed
#   (the CI committed the state only when the apply succeeded; fixed since).

import {
  to = infomaniak_record.www
  id = "lecolroule.fr,31539967"
}

import {
  to = infomaniak_record.test
  id = "lecolroule.fr,39463194"
}

import {
  to = module.test.bunnynet_storage_zone.this
  id = "2049613"
}

import {
  to = module.test.bunnynet_pullzone.this
  id = "6987987"
}

import {
  to = module.test.bunnynet_pullzone_edgerule.security_headers
  id = "6987987|2bc367ef-126c-4f7e-9809-4098242f427e"
}

import {
  to = module.test.bunnynet_pullzone_edgerule.redirect_root
  id = "6987987|3a286370-cdd3-420b-adef-adc07e7e0ec6"
}

import {
  to = module.test.bunnynet_pullzone_edgerule.rewrite_en
  id = "6987987|43c0a37b-5756-4f63-8e2f-c0c591f9c25a"
}

import {
  to = module.test.bunnynet_pullzone_edgerule.rewrite_fr
  id = "6987987|a4a20fb6-b533-4c58-8cdc-883acd93a7bb"
}
