terraform {
  required_version = ">= 1.8"

  required_providers {
    bunnynet = {
      source  = "BunnyWay/bunnynet"
      version = "~> 0.20"
    }
    infomaniak = {
      source  = "Infomaniak/infomaniak"
      version = "~> 1.4"
    }
  }
}

# The API key is read from the BUNNYNET_API_KEY environment variable.
provider "bunnynet" {}

# The API token (scope "domain") is read from the INFOMANIAK_TOKEN environment variable.
provider "infomaniak" {}
