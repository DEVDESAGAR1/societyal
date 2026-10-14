# Google Cloud APIs Module for SocietyFix AI

variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "disable_services_on_destroy" {
  description = "Whether to disable services when the module is destroyed"
  type        = bool
  default     = false
}

locals {
  services = [
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "storage.googleapis.com",
    "secretmanager.googleapis.com",
    "cloudtasks.googleapis.com",
    "cloudscheduler.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "compute.googleapis.com",
    "servicenetworking.googleapis.com",
    "vpcaccess.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "aiplatform.googleapis.com"
  ]
}

resource "google_project_service" "apis" {
  for_each                   = toset(locals.services)
  project                    = var.project_id
  service                    = each.key
  disable_on_destroy         = var.disable_services_on_destroy
  disable_dependent_services = false
}

output "enabled_services" {
  description = "List of enabled API services"
  value       = [for s in google_project_service.apis : s.service]
}
