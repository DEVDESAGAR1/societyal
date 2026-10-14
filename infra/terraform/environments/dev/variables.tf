variable "project_id" {
  description = "The Google Cloud Project ID"
  type        = string
}

variable "region" {
  description = "The Google Cloud Region (e.g. asia-south1)"
  type        = string
  default     = "asia-south1"
}

variable "container_image" {
  description = "Container image URI for Cloud Run deployment"
  type        = string
  default     = "asia-south1-docker.pkg.dev/societyfix-dev/societyfix-dev/api:latest"
}

variable "db_password" {
  description = "PostgreSQL root/application user password"
  type        = string
  sensitive   = true
}

variable "alert_email" {
  description = "Recipient email for operational alerts"
  type        = string
  default     = "devdesagar@gmail.com"
}
