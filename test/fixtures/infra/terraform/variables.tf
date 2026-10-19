variable "region" {
  type    = string
  default = "eu-west-1"
}

variable "environment" {
  type        = string
  description = "The environment: dev, staging or prod."
}

variable "db_password" {
  type      = string
  sensitive = true
  default   = "fixture-default-not-kept"
}
