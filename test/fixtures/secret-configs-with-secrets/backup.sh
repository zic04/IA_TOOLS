#!/bin/sh
set -e
export PGPASSWORD=Backup2024Orders
pg_dump "host=db.internal port=5432 user=backup password=Backup2024Dump dbname=orders" > orders.sql
mysqldump --user=backup --password=Mysql2024Dump orders > orders-mysql.sql
