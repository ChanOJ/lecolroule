# Former DNS records of the website in the lecolroule.fr zone at Infomaniak
# (www, test, Google Search Console verification). The 4 domains are served by
# Bunny DNS since 2026-11-17 (dns_bunny.tf): these records are no longer used.
# They leave the state without being deleted at Infomaniak (removed blocks:
# nothing is destroyed). Once applied, this file, the infomaniak provider
# (versions.tf) and the INFOMANIAK_TOKEN secret can go.

removed {
  from = infomaniak_record.www

  lifecycle {
    destroy = false
  }
}

removed {
  from = infomaniak_record.test

  lifecycle {
    destroy = false
  }
}

removed {
  from = infomaniak_record.google_site_verification

  lifecycle {
    destroy = false
  }
}
