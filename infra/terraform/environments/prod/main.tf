# SocietyFix AI — Production Environment Terraform Root (Hardened)

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }

  # Production state MUST be stored in a secured GCS bucket with object versioning
  # backend "gcs" {
  #   bucket = "societyfix-terraform-state-prod"
  #   prefix = "environments/prod"
  # }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

variable "project_id" {
  type = string
}

variable "region" {
  type    = string
  default = "asia-south1"
}

variable "container_image" {
  type = string
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "alert_email" {
  type    = string
  default = "devdesagar@gmail.com"
}

locals {
  environment = "prod"
}

module "apis" {
  source     = "../../modules/apis"
  project_id = var.project_id
}

module "iam" {
  source      = "../../modules/iam"
  project_id  = var.project_id
  environment = locals.environment
  depends_on  = [module.apis]
}

module "networking" {
  source         = "../../modules/networking"
  project_id     = var.project_id
  region         = var.region
  environment    = locals.environment
  vpc_cidr       = "10.30.0.0/24"
  connector_cidr = "10.30.1.0/28"
  depends_on     = [module.apis]
}

module "secrets" {
  source                = "../../modules/secrets"
  project_id            = var.project_id
  environment           = locals.environment
  service_account_email = module.iam.cloud_run_service_account_email
  depends_on            = [module.apis]
}

# Production High Availability Database (Regional Failover, 4 vCPU, 15GB RAM, 30-day backups)
module "cloud_sql" {
  source         = "../../modules/cloud_sql"
  project_id     = var.project_id
  region         = var.region
  environment    = locals.environment
  tier           = "db-custom-4-15360"
  network_id     = module.networking.network_id
  psa_dependency = module.networking.psa_connection_id
  db_password    = var.db_password
}

module "storage" {
  source                = "../../modules/storage"
  project_id            = var.project_id
  region                = var.region
  environment           = locals.environment
  service_account_email = module.iam.cloud_run_service_account_email
  depends_on            = [module.apis]
}

module "artifact_registry" {
  source      = "../../modules/artifact_registry"
  project_id  = var.project_id
  region      = var.region
  environment = locals.environment
  depends_on  = [module.apis]
}

module "cloud_tasks" {
  source      = "../../modules/cloud_tasks"
  project_id  = var.project_id
  region      = var.region
  environment = locals.environment
  depends_on  = [module.apis]
}

# Production Cloud Run: Min 1 Instance (Zero Cold Starts), Max 20 Instances
module "cloud_run" {
  source                = "../../modules/cloud_run"
  project_id            = var.project_id
  region                = var.region
  environment           = locals.environment
  container_image       = var.container_image
  service_account_email = module.iam.cloud_run_service_account_email
  vpc_connector_id      = module.networking.vpc_connector_id
  documents_bucket_name = module.storage.bucket_name
  tasks_queue_name      = module.cloud_tasks.queue_name
  min_instances         = 1
  max_instances         = 20
  depends_on            = [module.apis, module.secrets, module.cloud_sql]
}

module "cloud_scheduler" {
  source                          = "../../modules/cloud_scheduler"
  project_id                      = var.project_id
  region                          = var.region
  environment                     = locals.environment
  cloud_run_url                   = module.cloud_run.service_url
  scheduler_service_account_email = module.iam.scheduler_service_account_email
  depends_on                      = [module.cloud_run]
}

module "monitoring" {
  source                 = "../../modules/monitoring"
  project_id             = var.project_id
  environment            = locals.environment
  cloud_run_service_name = module.cloud_run.service_name
  alert_email            = var.alert_email
  depends_on             = [module.apis]
}

output "cloud_run_service_url" {
  value = module.cloud_run.service_url
}
