terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# ------------------------------------------------------------------------------
# 1. Artifact Registry (To store Docker Images)
# ------------------------------------------------------------------------------
resource "google_artifact_registry_repository" "avagamya_repo" {
  location      = var.region
  repository_id = "avagamya-repo"
  description   = "Docker repository for AVAGAMYA backend services"
  format        = "DOCKER"
}

# ------------------------------------------------------------------------------
# 2. Main FastAPI Backend (Cloud Run)
# ------------------------------------------------------------------------------
resource "google_cloud_run_v2_service" "main_backend" {
  name     = "avagamya-main-api"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    containers {
      # In a real CI/CD pipeline, this image tag is updated dynamically.
      # Make sure to push the image to Artifact Registry before applying.
      image = "${var.region}-docker.pkg.dev/${var.project_id}/avagamya-repo/main-api:latest"
      
      ports {
        container_port = 8000
      }

      env {
        name  = "SARVAM_API_KEY"
        value = var.sarvam_api_key
      }
      env {
        name  = "VITE_SUPABASE_URL"
        value = var.supabase_url
      }
      env {
        name  = "VITE_SUPABASE_KEY"
        value = var.supabase_key
      }
      
      # Point to the CV service URL dynamically once it's created
      env {
        name  = "CV_CLASSIFIER_URL"
        value = google_cloud_run_v2_service.cv_service.uri
      }
    }
    scaling {
      max_instance_count = 5
      min_instance_count = 0
    }
  }
}

# Allow public access to the Main API
resource "google_cloud_run_service_iam_member" "main_api_public" {
  location = google_cloud_run_v2_service.main_backend.location
  project  = google_cloud_run_v2_service.main_backend.project
  service  = google_cloud_run_v2_service.main_backend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ------------------------------------------------------------------------------
# 3. Computer Vision Microservice (Cloud Run)
# ------------------------------------------------------------------------------
resource "google_cloud_run_v2_service" "cv_service" {
  name     = "avagamya-cv-service"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/avagamya-repo/cv-service:latest"
      
      ports {
        container_port = 8080
      }
    }
    scaling {
      max_instance_count = 3
      min_instance_count = 0
    }
  }
}

# The CV Service can be public, or restricted to just the main API.
# For simplicity in this architecture, we allow public invocation.
resource "google_cloud_run_service_iam_member" "cv_service_public" {
  location = google_cloud_run_v2_service.cv_service.location
  project  = google_cloud_run_v2_service.cv_service.project
  service  = google_cloud_run_v2_service.cv_service.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
