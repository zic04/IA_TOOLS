module "app" {
  source = "../../modules/app"

  environment = "prod"
  replicas    = 3
}

module "network" {
  source = "git::https://git.example.test/acme/terraform-modules.git//network?ref=v1.2.0"
}

module "archive" {
  source = "s3::https://s3-eu-west-1.amazonaws.com/acme-modules/archive.zip?aws_access_key_id=fixture-id-not-kept&aws_access_key_secret=fixture-secret-not-kept"
}

resource "azurerm_network_security_rule" "https_in" {
  name                        = "https-in"
  priority                    = 100
  direction                   = "Inbound"
  access                      = "Allow"
  protocol                    = "Tcp"
  source_address_prefix       = "Internet"
  destination_port_range      = "443"
  resource_group_name         = "rg-shop-prod"
  network_security_group_name = "nsg-shop-prod"
}

resource "azurerm_network_security_rule" "all_out" {
  name                        = "all-out"
  priority                    = 110
  direction                   = "Outbound"
  access                      = "Allow"
  protocol                    = "*"
  source_address_prefix       = "*"
  destination_address_prefix  = "*"
  resource_group_name         = "rg-shop-prod"
  network_security_group_name = "nsg-shop-prod"
}

resource "azurerm_network_security_group" "deny_all" {
  name                = "nsg-deny"
  location            = "westeurope"
  resource_group_name = "rg-shop-prod"

  security_rule {
    name                       = "deny-all-in"
    priority                   = 4096
    direction                  = "Inbound"
    access                     = "Deny"
    protocol                   = "*"
    source_port_range          = "*"
    destination_port_range     = "*"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }
}
