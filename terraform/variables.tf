variable "project_id" {
  description = "The GCP Project ID"
  type        = string
}

variable "region" {
  description = "The GCP region to deploy resources (e.g. asia-south1)"
  type        = string
  default     = "asia-south1"
}

variable "sarvam_api_key" {
  description = "API Key for Sarvam AI"
  type        = string
  sensitive   = true
}

variable "supabase_url" {
  description = "Supabase Project URL"
  type        = string
}

variable "supabase_key" {
  description = "Supabase Anon/Service Role Key"
  type        = string
  sensitive   = true
}
