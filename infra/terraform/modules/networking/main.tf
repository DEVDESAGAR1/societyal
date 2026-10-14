# Networking Module: VPC, Private Services Access & Serverless VPC Connector

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

variable "vpc_cidr" {
  description = "CIDR range for the main subnet"
  type        = string
  default     = "10.10.0.0/24"
}

variable "connector_cidr" {
  description = "CIDR /28 block for the Serverless VPC Connector"
  type        = string
  default     = "10.10.1.0/28"
}

# 1. Dedicated VPC Network
resource "google_compute_network" "vpc" {
  name                    = "societyfix-${var.environment}-vpc"
  project                 = var.project_id
  auto_create_subnetworks = false
}

# 2. Main Subnet
resource "google_compute_subnetwork" "subnet" {
  name          = "societyfix-${var.environment}-subnet"
  project       = var.project_id
  region        = var.region
  network       = google_compute_network.vpc.id
  ip_cidr_range = var.vpc_cidr
}

# 3. Private IP Allocation for Cloud SQL (Private Services Access)
resource "google_compute_global_address" "private_ip_alloc" {
  name          = "societyfix-${var.environment}-psa-range"
  project       = var.project_id
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 20
  network       = google_compute_network.vpc.id
}

# 4. Service Networking Connection (Google Private Services Access)
resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_alloc.name]
}

# 5. Serverless VPC Access Connector (Enables Cloud Run to access Cloud SQL Private IP)
resource "google_vpc_access_connector" "connector" {
  name          = "soc-${var.environment}-con"
  project       = var.project_id
  region        = var.region
  ip_cidr_range = var.connector_cidr
  network       = google_compute_network.vpc.name
  min_instances = 2
  max_instances = 3
}

output "network_id" {
  description = "ID of the VPC network"
  value       = google_compute_network.vpc.id
}

output "vpc_connector_id" {
  description = "ID of the Serverless VPC Connector"
  value       = google_vpc_access_connector.connector.id
}

output "psa_connection_id" {
  description = "ID of the Private Services Access peering connection"
  value       = google_service_networking_connection.private_vpc_connection.id
}
