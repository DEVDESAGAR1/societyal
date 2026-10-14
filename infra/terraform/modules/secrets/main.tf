# Google Secret Manager Module

variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
}

variable "service_account_email" {
  description = "Service account email to grant read access"
  type        = string
}

locals {
  secret_names = [
    "database-url",
    "gemini-api-key",
    "firebase-admin-config"
  ]
}

# 1. Secret Containers in Secret Manager
resource "google_secret_manager_secret" "secrets" {
  for_each  = toset(locals.secret_names)
  project   = var.project_id
  secret_id = "societyfix-${var.environment}-${each.key}"

  replication {
    auto {}
  }
}

# 2. Grant Secret Accessor to Cloud Run Service Account
resource "google_secret_manager_secret_iam_member" "accessors" {
  for_each  = google_secret_manager_secret.secrets
  project   = var.project_id
  secret_id = each.value.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.service_account_email}"
}

output "secret_ids" {
  description = "Map of created secret IDs"
  value       = { for k, v in google_secret_manager_secret.secrets : k => v.id }
}

output "secret_names" {
  description = "Map of created secret names"
  value       = { for k, v in google_secret_manager_secret.secrets : k => v.secret_id }
}
