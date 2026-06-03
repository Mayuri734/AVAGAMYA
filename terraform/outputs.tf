output "main_api_url" {
  description = "The public URL of the Main FastAPI Backend"
  value       = google_cloud_run_v2_service.main_backend.uri
}

output "cv_service_url" {
  description = "The public URL of the Computer Vision Microservice"
  value       = google_cloud_run_v2_service.cv_service.uri
}

output "artifact_registry_repo" {
  description = "The URL of the Artifact Registry repository for Docker pushes"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.avagamya_repo.repository_id}"
}
