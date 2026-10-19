variable "environment" {
  type = string
}

variable "replicas" {
  type    = number
  default = 2
}

resource "kubernetes_deployment" "app" {
  metadata {
    name = "shop-${var.environment}"
  }
  spec {
    replicas = var.replicas
    template {
      spec {
        container {
          name  = "api"
          image = "ghcr.io/acme/shop:1.4.2"
          env {
            name  = "API_KEY"
            value = "fixture-env-value-not-kept"
          }
        }
      }
    }
  }
}

resource "google_compute_firewall" "public" {
  name          = "public-https"
  network       = "default"
  source_ranges = ["0.0.0.0/0"]

  allow {
    protocol = "tcp"
    ports    = ["443"]
  }
}

resource "google_compute_firewall" "block_all" {
  name          = "block-all"
  network       = "default"
  source_ranges = ["0.0.0.0/0"]

  deny {
    protocol = "all"
  }
}
