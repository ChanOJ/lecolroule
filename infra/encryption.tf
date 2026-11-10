# State and plan files are encrypted at rest (OpenTofu native encryption).
# The state holds secrets (storage zone passwords, pull zone token auth key),
# so it must never be written in plain text: `enforced = true` makes OpenTofu
# refuse to write an unencrypted state or plan.

variable "state_passphrase" {
  description = "Passphrase used to derive the state encryption key (at least 16 characters)."
  type        = string
  sensitive   = true
}

terraform {
  encryption {
    key_provider "pbkdf2" "main" {
      passphrase = var.state_passphrase
    }

    method "aes_gcm" "main" {
      keys = key_provider.pbkdf2.main
    }

    state {
      method   = method.aes_gcm.main
      enforced = true
    }

    plan {
      method   = method.aes_gcm.main
      enforced = true
    }
  }
}
