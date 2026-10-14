# IAM and Service Accounts Module for SocietyFix AI

variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
}

# 1. Cloud Run Runtime Service Account
resource "google_service_account" "cloud_run" {
  project      = var.project_id
  account_id   = "societyfix-${var.environment}-runner"
  display_name = "SocietyFix Cloud Run Service Account (${var.environment})"
  description  = "Least-privilege runtime identity for SocietyFix backend service"
}

# 2. Grant Secret Accessor to Cloud Run Service Account
resource "google_project_iam_member" "secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

# 3. Grant Cloud SQL Client to Cloud Run Service Account
resource "google_project_iam_member" "cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

# 4. Grant Cloud Tasks Enqueuer to Cloud Run Service Account
resource "google_project_iam_member" "cloudtasks_enqueuer" {
  project = var.project_id
  role    = "roles/cloudtasks.enqueuer"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

# 5. Grant Logging and Metrics Writer
resource "google_project_iam_member" "log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_project_iam_member" "metric_writer" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

# 6. Cloud Scheduler Service Account (To invoke Cloud Run internal cron endpoints)
resource "google_service_account" "scheduler" {
  project      = var.project_id
  account_id   = "societyfix-${var.environment}-sched"
  display_name = "SocietyFix Cloud Scheduler Service Account (${var.environment})"
  description  = "Identity for Cloud Scheduler to invoke internal cron webhooks"
}

output "cloud_run_service_account_email" {
  description = "Email of the Cloud Run runtime service account"
  value       = google_service_account.cloud_run.email
}

output "scheduler_service_account_email" {
  description = "Email of the Cloud Scheduler service account"
  value       = google_service_account.scheduler.email
}
