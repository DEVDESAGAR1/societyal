# Google Cloud Scheduler Cron Module

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

variable "cloud_run_url" {
  description = "Target Cloud Run service URL"
  type        = string
}

variable "scheduler_service_account_email" {
  description = "Service account email for Cloud Scheduler OIDC invocation"
  type        = string
}

# 1. Daily Morning SLA and Escalation Check (07:00 IST = 01:30 UTC)
resource "google_cloud_scheduler_job" "daily_sla_check" {
  name             = "societyfix-${var.environment}-daily-sla-check"
  project          = var.project_id
  region           = var.region
  description      = "Trigger daily task SLA escalation and maintenance check at 07:00 IST"
  schedule         = "30 1 * * *" # 01:30 UTC = 07:00 AM IST
  time_zone        = "Asia/Kolkata"
  attempt_deadline = "300s"

  http_target {
    http_method = "POST"
    uri         = "${var.cloud_run_url}/api/internal/cron/daily-sla-check"

    oidc_token {
      service_account_email = var.scheduler_service_account_email
      audience              = var.cloud_run_url
    }

    headers = {
      "Content-Type" = "application/json"
    }

    body = base64encode("{\"job\":\"daily_sla_check\",\"environment\":\"${var.environment}\"}")
  }
}

output "daily_sla_job_id" {
  description = "Cloud Scheduler job ID"
  value       = google_cloud_scheduler_job.daily_sla_check.id
}
