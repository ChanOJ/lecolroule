# The German root redirect rules were created at bunny.net by an apply that
# then failed ("Order index must be unique": the rules they took the slot of
# were being moved at the same time), so they are missing from the state.
# Import them; remove this file once applied.

import {
  to = module.prod.bunnynet_pullzone_edgerule.root_language["de"]
  id = "5222227|8dc12d95-0a10-4576-8638-0e5d0f777bb3"
}

import {
  to = module.prod.bunnynet_pullzone_edgerule.root_cookie_language["de"]
  id = "5222227|117110ad-ea84-4185-bfab-fb71917fde30"
}

import {
  to = module.test.bunnynet_pullzone_edgerule.root_language["de"]
  id = "6987987|5cf54fd1-3d5d-4f35-a94e-2ee1cfe02ebb"
}

import {
  to = module.test.bunnynet_pullzone_edgerule.root_cookie_language["de"]
  id = "6987987|5e794e10-7879-4d18-a591-f7535f03973a"
}
