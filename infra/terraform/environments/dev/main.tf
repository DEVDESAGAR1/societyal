# SocietyFix AI — Development Environment Terraform Root

locals {
  environment = "dev"
}

# 1. Enable Required GCP APIs
module "apis" {
  source     = "../../modules/apis"
  project_id = var.project_id
}

# 2. Service Identities & IAM
module "iam" {
  source      = "../../modules/iam"
  project_id  = var.project_id
  environment = locals.environment
  depends_on  = [module.apis]
}

# 3. Networking, VPC & Serverless VPC Connector
module "networking" {
  source      = "../../modules/networking"
  project_id  = var.project_id
  region      = var.region
  environment = locals.environment
  vpc_cidr    = "10.10.0.0/24"
  connector_cidr = "10.10.1.0/28"
  depends_on  = [module.apis]
}

# 4. Secret Manager Containers
module "secrets" {
  source                = "../../modules/secrets"
  project_id            = var.project_id
  environment           = locals.environment
  service_account_email = module.iam.cloud_run_service_account_email
  depends_on            = [module.apis]
}

# 5. Cloud SQL PostgreSQL 16 (Private IP)
module "cloud_sql" {
  source         = "../../modules/cloud_sql"
  project_id     = var.project_id
  region         = var.region
  environment    = locals.environment
  tier           = "db-custom-2-7680"
  network_id     = module.networking.network_id
  psa_dependency = module.networking.psa_connection_id
  db_password    = var.db_password
}

# 6. Private Document Storage Bucket
module "storage" {
  source                = "../../modules/storage"
  project_id            = var.project_id
  region                = var.region
  environment           = locals.environment
  service_account_email = module.iam.cloud_run_service_account_email
  depends_on            = [module.apis]
}

# 7. Artifact Registry for Docker Images
module "artifact_registry" {
  source      = "../../modules/artifact_registry"
  project_id  = var.project_id
  region      = var.region
  environment = locals.environment
  depends_on  = [module.apis]
}

# 8. Cloud Tasks Push Queue
module "cloud_tasks" {
  source      = "../../modules/cloud_tasks"
  project_id  = var.project_id
  region      = var.region
  environment = locals.environment
  depends_on  = [module.apis]
}

# 9. Cloud Run Service Deployment
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
  min_instances         = 0
  max_instances         = 3
  depends_on            = [module.apis, module.secrets, module.cloud_sql]
}

# 10. Cloud Scheduler Cron Jobs
module "cloud_scheduler" {
  source                          = "../../modules/cloud_scheduler"
  project_id                      = var.project_id
  region                          = var.region
  environment                     = locals.environment
  cloud_run_url                   = module.cloud_run.service_url
  scheduler_service_account_email = module.iam.scheduler_service_account_email
  depends_on                      = [module.cloud_run]
}

# 11. Cloud Monitoring & Alerting
module "monitoring" {
  source                 = "../../modules/monitoring"
  project_id             = var.project_id
  environment            = locals.environment
  cloud_run_service_name = module.cloud_run.service_name
  alert_email            = var.alert_email
  depends_on             = [module.apis]
}
