terraform {
  required_version = ">= 1.8"

  required_providers {
    bunnynet = {
      source  = "BunnyWay/bunnynet"
      version = "~> 0.20"
    }
  }
}

# The API key is read from the BUNNYNET_API_KEY environment variable.
provider "bunnynet" {}
