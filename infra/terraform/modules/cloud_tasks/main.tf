# Google Cloud Tasks Push Queue Module

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

resource "google_cloud_tasks_queue" "tasks" {
  name     = "societyfix-${var.environment}-tasks"
  project  = var.project_id
  location = var.region

  rate_limits {
    max_dispatches_per_second = 50
    max_concurrent_dispatches = 20
  }

  retry_config {
    max_attempts       = 5
    min_backoff        = "2s"
    max_backoff        = "300s"
    max_doublings      = 4
    max_retry_duration = "3600s"
  }
}

output "queue_name" {
  description = "Cloud Tasks queue name"
  value       = google_cloud_tasks_queue.tasks.name
}

output "queue_id" {
  description = "Cloud Tasks queue ID"
  value       = google_cloud_tasks_queue.tasks.id
}
