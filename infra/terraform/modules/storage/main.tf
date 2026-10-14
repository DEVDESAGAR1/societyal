# Google Cloud Storage Private Documents Bucket Module

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

variable "service_account_email" {
  description = "Email of the Cloud Run runtime service account"
  type        = string
}

# 1. Private Storage Bucket for Housing Society Documents
resource "google_storage_bucket" "documents" {
  name                        = "societyfix-${var.environment}-documents-${var.project_id}"
  project                     = var.project_id
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced" # STRICT SECURITY: Impossible to make any object public

  versioning {
    enabled = var.environment == "prod" ? true : false
  }

  cors {
    origin          = ["*"]
    method          = ["GET", "PUT", "HEAD"]
    response_header = ["*"]
    max_age_seconds = 3600
  }

  # Lifecycle Rule 1: Automatically purge raw meeting audio recordings after 90 days
  # (in accordance with DPDP Act 2023 storage limitation principle and M0 policy)
  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      age        = 90
      matches_prefix = ["societies/*/meetings/*/audio/"]
    }
  }

  # Lifecycle Rule 2: Move older non-current versions to Nearline storage after 30 days
  lifecycle_rule {
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
    condition {
      num_newer_versions = 2
      days_since_noncurrent_time = 30
    }
  }
}

# 2. Grant Storage Object Admin ONLY to the Cloud Run Service Account
resource "google_storage_bucket_iam_member" "cloud_run_storage_access" {
  bucket = google_storage_bucket.documents.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${var.service_account_email}"
}

output "bucket_name" {
  description = "Name of the documents storage bucket"
  value       = google_storage_bucket.documents.name
}

output "bucket_url" {
  description = "gs:// URI of the storage bucket"
  value       = google_storage_bucket.documents.url
}
