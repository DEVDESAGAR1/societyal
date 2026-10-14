output "cloud_run_service_url" {
  description = "The deployed Cloud Run service URL"
  value       = module.cloud_run.service_url
}

output "cloud_sql_private_ip" {
  description = "Private IP of Cloud SQL PostgreSQL instance"
  value       = module.cloud_sql.private_ip_address
}

output "storage_bucket_name" {
  description = "Name of the private documents storage bucket"
  value       = module.storage.bucket_name
}

output "artifact_registry_repo_url" {
  description = "Artifact Registry repository push URL"
  value       = module.artifact_registry.repository_url
}

output "cloud_tasks_queue_name" {
  description = "Cloud Tasks queue name"
  value       = module.cloud_tasks.queue_name
}
