# Google Cloud Run Service Module for SocietyFix AI

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

variable "container_image" {
  description = "Container image URI (with tag or sha256 digest)"
  type        = string
}

variable "service_account_email" {
  description = "Runtime service account email"
  type        = string
}

variable "vpc_connector_id" {
  description = "Serverless VPC Access connector ID"
  type        = string
}

variable "documents_bucket_name" {
  description = "GCS documents bucket name"
  type        = string
}

variable "tasks_queue_name" {
  description = "Cloud Tasks queue name"
  type        = string
}

variable "min_instances" {
  description = "Minimum instances (0 for dev/staging, 1 for prod to avoid cold starts)"
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Maximum instances to prevent runaway auto-scaling costs"
  type        = number
  default     = 5
}

# 1. Cloud Run Service (v2 API)
resource "google_cloud_run_v2_service" "app" {
  name     = "societyfix-${var.environment}-api"
  project  = var.project_id
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = var.service_account_email
    timeout         = "300s"

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    vpc_access {
      connector = var.vpc_connector_id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = var.container_image

      resources {
        limits = {
          cpu    = "1000m"
          memory = "1024Mi"
        }
        cpu_idle = true
      }

      ports {
        container_port = 3000
      }

      # Standard Environment Configuration
      env {
        name  = "NODE_ENV"
        value = var.environment == "prod" ? "production" : "development"
      }

      env {
        name  = "PORT"
        value = "3000"
      }

      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }

      env {
        name  = "GOOGLE_CLOUD_REGION"
        value = var.region
      }

      env {
        name  = "GCS_DOCUMENTS_BUCKET"
        value = var.documents_bucket_name
      }

      env {
        name  = "CLOUD_TASKS_QUEUE_NAME"
        value = var.tasks_queue_name
      }

      # Secret Manager References (Never deployed as plain text in manifests)
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = "societyfix-${var.environment}-database-url"
            version = "latest"
          }
        }
      }

      env {
        name = "GEMINI_API_KEY"
        value_source {
          secret_key_ref {
            secret  = "societyfix-${var.environment}-gemini-api-key"
            version = "latest"
          }
        }
      }

      startup_probe {
        initial_delay_seconds = 0
        timeout_seconds       = 5
        period_seconds        = 10
        failure_threshold     = 3
        tcp_socket {
          port = 3000
        }
      }

      liveness_probe {
        timeout_seconds   = 5
        period_seconds    = 30
        failure_threshold = 3
        http_get {
          path = "/api/ready"
          port = 3000
        }
      }
    }
  }
}

# 2. Allow Public Invocations for the Web App
resource "google_cloud_run_v2_service_iam_member" "public_access" {
  project  = var.project_id
  location = google_cloud_run_v2_service.app.location
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

output "service_name" {
  description = "Name of the Cloud Run service"
  value       = google_cloud_run_v2_service.app.name
}

output "service_url" {
  description = "URI of the Cloud Run service"
  value       = google_cloud_run_v2_service.app.uri
}
