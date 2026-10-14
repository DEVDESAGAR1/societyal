# Cloud SQL for PostgreSQL 16 Module

variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP Region (e.g. asia-south1)"
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
}

variable "tier" {
  description = "Machine tier for the database"
  type        = string
  default     = "db-custom-2-7680" # 2 vCPU, 7.5GB RAM
}

variable "network_id" {
  description = "VPC network ID for private IP access"
  type        = string
}

variable "psa_dependency" {
  description = "Explicit dependency on the Private Services Access peering"
  type        = any
}

variable "database_name" {
  description = "Initial database name"
  type        = string
  default     = "societyfix"
}

variable "db_username" {
  description = "Application database username"
  type        = string
  default     = "societyfix_app"
}

variable "db_password" {
  description = "Application database password"
  type        = string
  sensitive   = true
}

# 1. Cloud SQL PostgreSQL Instance (Private IP Only, Zero Public Exposure)
resource "google_sql_database_instance" "postgres" {
  name                = "societyfix-${var.environment}-pg16"
  project             = var.project_id
  region              = var.region
  database_version    = "POSTGRES_16"
  deletion_protection = var.environment == "prod" ? true : false

  depends_on = [var.psa_dependency]

  settings {
    tier              = var.tier
    availability_type = var.environment == "prod" ? "REGIONAL" : "ZONAL"
    disk_type         = "PD_SSD"
    disk_size         = var.environment == "prod" ? 50 : 20
    disk_autoresize   = true

    ip_configuration {
      ipv4_enabled    = false # STRICT SECURITY: Disable public IPv4 address completely
      private_network = var.network_id
      require_ssl     = true  # Enforce TLS 1.3
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "02:00" # 02:00 UTC = 07:30 IST (off-peak)
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = var.environment == "prod" ? 30 : 7
        retention_unit   = "COUNT"
      }
    }

    maintenance_window {
      day          = 7 # Sunday
      hour         = 3 # 03:00 UTC = 08:30 IST
      update_track = "stable"
    }

    database_flags {
      name  = "cloudsql.enable_pgaudit"
      value = "on"
    }

    database_flags {
      name  = "pgaudit.log"
      value = "ddl,role"
    }

    insights_config {
      query_insights_enabled  = true
      query_string_length     = 1024
      record_application_tags = true
    }
  }
}

# 2. Database Creation
resource "google_sql_database" "database" {
  name     = "${var.database_name}_${var.environment}"
  project  = var.project_id
  instance = google_sql_database_instance.postgres.name
}

# 3. Application Database User
resource "google_sql_user" "app_user" {
  name     = var.db_username
  project  = var.project_id
  instance = google_sql_database_instance.postgres.name
  password = var.db_password
}

output "instance_name" {
  description = "Cloud SQL Instance Name"
  value       = google_sql_database_instance.postgres.name
}

output "connection_name" {
  description = "Cloud SQL Connection Name (PROJECT:REGION:INSTANCE)"
  value       = google_sql_database_instance.postgres.connection_name
}

output "private_ip_address" {
  description = "Private IP address of the database"
  value       = google_sql_database_instance.postgres.private_ip_address
}

output "database_name" {
  description = "Database name"
  value       = google_sql_database.database.name
}
