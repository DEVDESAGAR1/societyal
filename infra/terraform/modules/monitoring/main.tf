# Cloud Monitoring and Alerting Module

variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
}

variable "cloud_run_service_name" {
  description = "Target Cloud Run service name"
  type        = string
}

variable "alert_email" {
  description = "Notification email address for operational alerts"
  type        = string
  default     = "devdesagar@gmail.com"
}

# 1. Email Notification Channel
resource "google_monitoring_notification_channel" "email" {
  project      = var.project_id
  display_name = "SocietyFix ${var.environment} Alert Email (${var.alert_email})"
  type         = "email"

  labels = {
    email_address = var.alert_email
  }
}

# 2. Alert Policy: Cloud Run High 5xx Error Rate (> 2% for 5 minutes)
resource "google_monitoring_alert_policy" "cloud_run_5xx_errors" {
  project      = var.project_id
  display_name = "SocietyFix ${var.environment}: Cloud Run High 5xx HTTP Error Rate"
  combiner     = "OR"

  conditions {
    display_name = "Cloud Run 5xx Error Rate > 2%"
    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND resource.labels.service_name = \"${var.cloud_run_service_name}\" AND metric.type = \"run.googleapis.com/request_count\" AND metric.labels.response_code_class = \"5xx\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.02
      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.name]

  documentation {
    content   = "Cloud Run service ${var.cloud_run_service_name} in ${var.environment} is returning elevated 5xx server errors. Check Cloud Logging for uncaught exceptions or database pool exhaustion."
    mime_type = "text/markdown"
  }
}

# 3. Alert Policy: High Request Latency (> 2000ms for 5 minutes)
resource "google_monitoring_alert_policy" "high_latency" {
  project      = var.project_id
  display_name = "SocietyFix ${var.environment}: Cloud Run Latency P95 > 2s"
  combiner     = "OR"

  conditions {
    display_name = "Cloud Run Request Latency P95 > 2000ms"
    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND resource.labels.service_name = \"${var.cloud_run_service_name}\" AND metric.type = \"run.googleapis.com/request_latencies\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 2000
      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_PERCENTILE_95"
        cross_series_reducer = "REDUCE_MEAN"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.name]
}

output "notification_channel_id" {
  description = "ID of the email notification channel"
  value       = google_monitoring_notification_channel.email.id
}
