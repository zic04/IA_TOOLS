# The shop's infrastructure on AWS.
terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "5.31.0"
    }
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.90"
    }
    random = "3.6.0"
  }

  backend "s3" {
    bucket = "acme-terraform-state"
    key    = "shop/terraform.tfstate"
  }
}

provider "aws" {
  region = var.region
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]
}

resource "aws_s3_bucket" "assets" {
  bucket = "acme-shop-assets-${var.environment}"
  tags = {
    Name = "assets"
  }
}

resource "aws_security_group" "web" {
  name        = "web"
  description = "HTTPS from anywhere; resource \"fake\" \"in_string\" { is no block"

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "admin" {
  name = "admin"

  ingress {
    from_port = 22
    to_port   = 22
    protocol  = "tcp"
    cidr_blocks = [
      "10.20.0.0/16",
    ]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group_rule" "metrics_out" {
  type              = "egress"
  from_port         = 9090
  to_port           = 9090
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.web.id
}

resource "aws_instance" "web" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = "t3.small"
  user_data     = <<-EOT
    #!/bin/bash
    echo 'resource "aws_instance" "in_heredoc" {' > /tmp/x
    }
  EOT
  vpc_security_group_ids = [aws_security_group.web.id]
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.5.1"

  name            = "shop"
  cidr            = "10.20.0.0/16"
  azs             = ["eu-west-1a", "eu-west-1b"]
  private_subnets = ["10.20.1.0/24", "10.20.2.0/24"]
  depends_on      = [aws_s3_bucket.assets]
}

# resource "aws_instance" "legacy" {
#   instance_type = "t2.micro"
# }

/*
module "old_network" {
  source = "./modules/old"
}
*/

// output "commented" { value = 1 }
