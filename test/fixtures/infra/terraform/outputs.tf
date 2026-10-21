output "bucket_arn" {
  value = aws_s3_bucket.assets.arn
}

output "db_connection" {
  value     = "postgres://shop:${var.db_password}@db.internal:5432/shop"
  sensitive = true
}
