
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {

  "public": {
          Tables: {
            "ai_job_attempts": {
                  Row: {
                    "attempt": number,"completed_at": string | null,"completion_fingerprint": string | null,"duration_ms": number | null,"job_id": string,"owner_id": string,"qa_max_items": number | null,"qa_mock": boolean | null,"request_id": string,"reserved_at": string,"result_code": string | null,"steps": Json | null,"usage": Json | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt": number,"completed_at"?: string | null,"completion_fingerprint"?: string | null,"duration_ms"?: number | null,"job_id": string,"owner_id": string,"qa_max_items"?: number | null,"qa_mock"?: boolean | null,"request_id": string,"reserved_at"?: string,"result_code"?: string | null,"steps"?: Json | null,"usage"?: Json | null
                  }
                  Update: {
                    "attempt"?: number,"completed_at"?: string | null,"completion_fingerprint"?: string | null,"duration_ms"?: number | null,"job_id"?: string,"owner_id"?: string,"qa_max_items"?: number | null,"qa_mock"?: boolean | null,"request_id"?: string,"reserved_at"?: string,"result_code"?: string | null,"steps"?: Json | null,"usage"?: Json | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_job_attempts_owner_id_job_id_fkey"
      columns: ["owner_id","job_id"]
isOneToOne: false
      referencedRelation: "ai_jobs"
      referencedColumns: ["owner_id","id"]
    }
                  ]
                },"ai_jobs": {
                  Row: {
                    "artwork_id": string | null,"attempt": number,"audio_approval_id": string | null,"automation_event_id": string | null,"created_at": string,"document_id": string | null,"expected_document_revision": number | null,"expected_revision": number | null,"expires_at": string,"id": string,"kind": string,"lease_until": string,"mock": boolean,"owner_id": string,"proposal_expires_at": string | null,"qa_exhibition_id": string | null,"request_id": string,"result": Json | null,"result_code": string | null,"routing": string,"source_fingerprint": NonNullable<Json>,"source_ids": NonNullable<Json>,"status": string,"strategy": string | null,"updated_at": string,"voice_config_version": number | null,"voice_fingerprint": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "artwork_id"?: string | null,"attempt"?: number,"audio_approval_id"?: string | null,"automation_event_id"?: string | null,"created_at"?: string,"document_id"?: string | null,"expected_document_revision"?: number | null,"expected_revision"?: number | null,"expires_at": string,"id"?: string,"kind"?: string,"lease_until": string,"mock"?: boolean,"owner_id": string,"proposal_expires_at"?: string | null,"qa_exhibition_id"?: string | null,"request_id": string,"result"?: Json | null,"result_code"?: string | null,"routing"?: string,"source_fingerprint": NonNullable<Json>,"source_ids": NonNullable<Json>,"status"?: string,"strategy"?: string | null,"updated_at"?: string,"voice_config_version"?: number | null,"voice_fingerprint"?: string | null
                  }
                  Update: {
                    "artwork_id"?: string | null,"attempt"?: number,"audio_approval_id"?: string | null,"automation_event_id"?: string | null,"created_at"?: string,"document_id"?: string | null,"expected_document_revision"?: number | null,"expected_revision"?: number | null,"expires_at"?: string,"id"?: string,"kind"?: string,"lease_until"?: string,"mock"?: boolean,"owner_id"?: string,"proposal_expires_at"?: string | null,"qa_exhibition_id"?: string | null,"request_id"?: string,"result"?: Json | null,"result_code"?: string | null,"routing"?: string,"source_fingerprint"?: NonNullable<Json>,"source_ids"?: NonNullable<Json>,"status"?: string,"strategy"?: string | null,"updated_at"?: string,"voice_config_version"?: number | null,"voice_fingerprint"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_jobs_audio_approval_id_fkey"
      columns: ["audio_approval_id"]
isOneToOne: false
      referencedRelation: "narration_approvals"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_jobs_automation_event_id_fkey"
      columns: ["automation_event_id"]
isOneToOne: true
      referencedRelation: "automation_events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_jobs_owner_id_artwork_id_fkey"
      columns: ["owner_id","artwork_id"]
isOneToOne: false
      referencedRelation: "artworks"
      referencedColumns: ["owner_id","id"]
    },{
      foreignKeyName: "ai_jobs_owner_id_qa_exhibition_id_artwork_id_fkey"
      columns: ["owner_id","qa_exhibition_id","artwork_id"]
isOneToOne: false
      referencedRelation: "artworks"
      referencedColumns: ["owner_id","exhibition_id","id"]
    },{
      foreignKeyName: "ai_jobs_owner_id_qa_exhibition_id_fkey"
      columns: ["owner_id","qa_exhibition_id"]
isOneToOne: false
      referencedRelation: "exhibitions"
      referencedColumns: ["owner_id","id"]
    },{
      foreignKeyName: "ai_jobs_voice_config_version_fkey"
      columns: ["voice_config_version"]
isOneToOne: false
      referencedRelation: "voice_configs"
      referencedColumns: ["version"]
    }
                  ]
                },"api_requests": {
                  Row: {
                    "answer_text": string | null,"artwork_id": string | null,"created_at": string,"exhibition_id": string,"expires_at": string,"failure_code": string | null,"id": string,"input_hash": string | null,"kind": string,"lease_until": string | null,"mock": boolean,"publication_id": string | null,"reply_audio_key": string | null,"request_id": string,"result": Json | null,"session_hash": string,"source_answer_id": string | null,"state": string,"steps": Json | null,"updated_at": string,"usage": NonNullable<Json>,"voice_fingerprint": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "answer_text"?: string | null,"artwork_id"?: string | null,"created_at"?: string,"exhibition_id": string,"expires_at"?: string,"failure_code"?: string | null,"id"?: string,"input_hash"?: string | null,"kind": string,"lease_until"?: string | null,"mock"?: boolean,"publication_id"?: string | null,"reply_audio_key"?: string | null,"request_id": string,"result"?: Json | null,"session_hash": string,"source_answer_id"?: string | null,"state"?: string,"steps"?: Json | null,"updated_at"?: string,"usage"?: NonNullable<Json>,"voice_fingerprint"?: string | null
                  }
                  Update: {
                    "answer_text"?: string | null,"artwork_id"?: string | null,"created_at"?: string,"exhibition_id"?: string,"expires_at"?: string,"failure_code"?: string | null,"id"?: string,"input_hash"?: string | null,"kind"?: string,"lease_until"?: string | null,"mock"?: boolean,"publication_id"?: string | null,"reply_audio_key"?: string | null,"request_id"?: string,"result"?: Json | null,"session_hash"?: string,"source_answer_id"?: string | null,"state"?: string,"steps"?: Json | null,"updated_at"?: string,"usage"?: NonNullable<Json>,"voice_fingerprint"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "api_requests_exhibition_id_artwork_id_publication_id_fkey"
      columns: ["exhibition_id","artwork_id","publication_id"]
isOneToOne: false
      referencedRelation: "publications"
      referencedColumns: ["exhibition_id","artwork_id","id"]
    },{
      foreignKeyName: "api_requests_exhibition_id_fkey"
      columns: ["exhibition_id"]
isOneToOne: false
      referencedRelation: "exhibitions"
      referencedColumns: ["id"]
    }
                  ]
                },"app_features": {
                  Row: {
                    "enabled": boolean,"key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "enabled": boolean,"key": string
                  }
                  Update: {
                    "enabled"?: boolean,"key"?: string
                  }
                  Relationships: [

                  ]
                },"app_policies": {
                  Row: {
                    "key": string,"updated_at": string,"value": number
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"updated_at"?: string,"value": number
                  }
                  Update: {
                    "key"?: string,"updated_at"?: string,"value"?: number
                  }
                  Relationships: [

                  ]
                },"artist_profiles": {
                  Row: {
                    "avatar_material_id": string | null,"created_at": string,"display_name": string | null,"full_name": string | null,"id": string,"keywords": NonNullable<Json>,"onboarding_completed_at": string | null,"owner_id": string,"revision": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_material_id"?: string | null,"created_at"?: string,"display_name"?: string | null,"full_name"?: string | null,"id"?: string,"keywords"?: NonNullable<Json>,"onboarding_completed_at"?: string | null,"owner_id": string,"revision"?: number,"updated_at"?: string
                  }
                  Update: {
                    "avatar_material_id"?: string | null,"created_at"?: string,"display_name"?: string | null,"full_name"?: string | null,"id"?: string,"keywords"?: NonNullable<Json>,"onboarding_completed_at"?: string | null,"owner_id"?: string,"revision"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "artist_profiles_avatar_material_fk"
      columns: ["owner_id","id","avatar_material_id"]
isOneToOne: false
      referencedRelation: "materials"
      referencedColumns: ["owner_id","artist_id","id"]
    }
                  ]
                },"artwork_interview_answers": {
                  Row: {
                    "body": string,"owner_id": string,"question_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"owner_id": string,"question_id": string
                  }
                  Update: {
                    "body"?: string,"owner_id"?: string,"question_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "artwork_interview_answers_owner_id_question_id_fkey"
      columns: ["owner_id","question_id"]
isOneToOne: false
      referencedRelation: "artwork_interview_questions"
      referencedColumns: ["owner_id","id"]
    }
                  ]
                },"artwork_interview_questions": {
                  Row: {
                    "artwork_id": string,"created_at": string,"evidence_id": string | null,"id": string,"owner_id": string,"question": string,"slot": number,"status": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "artwork_id": string,"created_at"?: string,"evidence_id"?: string | null,"id"?: string,"owner_id": string,"question": string,"slot": number,"status"?: string,"version"?: number
                  }
                  Update: {
                    "artwork_id"?: string,"created_at"?: string,"evidence_id"?: string | null,"id"?: string,"owner_id"?: string,"question"?: string,"slot"?: number,"status"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "artwork_interview_questions_owner_id_artwork_id_fkey"
      columns: ["owner_id","artwork_id"]
isOneToOne: false
      referencedRelation: "artworks"
      referencedColumns: ["owner_id","id"]
    }
                  ]
                },"artworks": {
                  Row: {
                    "active_draft_number": number | null,"active_publication_id": string | null,"create_fingerprint": string,"created_at": string,"creation_year": string | null,"deleted_at": string | null,"dimensions": string | null,"dimensions_unit": string | null,"draft_number": number | null,"exhibition_id": string,"id": string,"image_material_id": string | null,"medium": string | null,"narration_draft": string | null,"number": number,"owner_id": string,"revision": number,"state": string,"title": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active_draft_number"?: never,"active_publication_id"?: string | null,"create_fingerprint": string,"created_at"?: string,"creation_year"?: string | null,"deleted_at"?: string | null,"dimensions"?: string | null,"dimensions_unit"?: string | null,"draft_number"?: number | null,"exhibition_id": string,"id": string,"image_material_id"?: string | null,"medium"?: string | null,"narration_draft"?: string | null,"number": number,"owner_id": string,"revision"?: number,"state"?: string,"title"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "active_draft_number"?: never,"active_publication_id"?: string | null,"create_fingerprint"?: string,"created_at"?: string,"creation_year"?: string | null,"deleted_at"?: string | null,"dimensions"?: string | null,"dimensions_unit"?: string | null,"draft_number"?: number | null,"exhibition_id"?: string,"id"?: string,"image_material_id"?: string | null,"medium"?: string | null,"narration_draft"?: string | null,"number"?: number,"owner_id"?: string,"revision"?: number,"state"?: string,"title"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "artworks_active_publication_fk"
      columns: ["owner_id","id","active_publication_id"]
isOneToOne: false
      referencedRelation: "publications"
      referencedColumns: ["owner_id","artwork_id","id"]
    },{
      foreignKeyName: "artworks_image_material_fk"
      columns: ["owner_id","id","image_material_id"]
isOneToOne: false
      referencedRelation: "materials"
      referencedColumns: ["owner_id","artwork_id","id"]
    },{
      foreignKeyName: "artworks_owner_id_exhibition_id_fkey"
      columns: ["owner_id","exhibition_id"]
isOneToOne: false
      referencedRelation: "exhibitions"
      referencedColumns: ["owner_id","id"]
    }
                  ]
                },"audio_assets": {
                  Row: {
                    "approval_id": string,"artwork_id": string,"attempt": number | null,"byte_size": number | null,"cleanup_after": string | null,"content_hash": string | null,"created_at": string,"exhibition_id": string,"id": string,"job_id": string | null,"mock": boolean,"owner_id": string,"state": string,"storage_key": string | null,"text_hash": string,"voice_config_version": number,"voice_fingerprint": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "approval_id": string,"artwork_id": string,"attempt"?: number | null,"byte_size"?: number | null,"cleanup_after"?: string | null,"content_hash"?: string | null,"created_at"?: string,"exhibition_id": string,"id"?: string,"job_id"?: string | null,"mock"?: boolean,"owner_id": string,"state"?: string,"storage_key"?: string | null,"text_hash": string,"voice_config_version": number,"voice_fingerprint"?: string | null
                  }
                  Update: {
                    "approval_id"?: string,"artwork_id"?: string,"attempt"?: number | null,"byte_size"?: number | null,"cleanup_after"?: string | null,"content_hash"?: string | null,"created_at"?: string,"exhibition_id"?: string,"id"?: string,"job_id"?: string | null,"mock"?: boolean,"owner_id"?: string,"state"?: string,"storage_key"?: string | null,"text_hash"?: string,"voice_config_version"?: number,"voice_fingerprint"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audio_assets_owner_id_exhibition_id_artwork_id_approval_id_fkey"
      columns: ["owner_id","exhibition_id","artwork_id","approval_id"]
isOneToOne: false
      referencedRelation: "narration_approvals"
      referencedColumns: ["owner_id","exhibition_id","artwork_id","id"]
    }
                  ]
                },"automation_bindings": {
                  Row: {
                    "enabled": boolean,"external_id": string,"owner_id": string,"provider": string,"provider_scope": string,"revision": number
                  }
                  ComputedFields: never
                  Insert: {
                    "enabled"?: boolean,"external_id": string,"owner_id": string,"provider": string,"provider_scope": string,"revision"?: number
                  }
                  Update: {
                    "enabled"?: boolean,"external_id"?: string,"owner_id"?: string,"provider"?: string,"provider_scope"?: string,"revision"?: number
                  }
                  Relationships: [

                  ]
                },"automation_events": {
                  Row: {
                    "attempt": number,"completion_fingerprint": string | null,"created_at": string,"dedupe_key": string,"exhibition_id": string | null,"expires_at": string,"id": string,"kind": string,"lease_until": string | null,"mock": boolean,"owner_id": string | null,"result_code": string | null,"source_revision": number | null,"state": string,"trigger_kind": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt"?: number,"completion_fingerprint"?: string | null,"created_at"?: string,"dedupe_key": string,"exhibition_id"?: string | null,"expires_at": string,"id"?: string,"kind": string,"lease_until"?: string | null,"mock": boolean,"owner_id"?: string | null,"result_code"?: string | null,"source_revision"?: number | null,"state"?: string,"trigger_kind": string
                  }
                  Update: {
                    "attempt"?: number,"completion_fingerprint"?: string | null,"created_at"?: string,"dedupe_key"?: string,"exhibition_id"?: string | null,"expires_at"?: string,"id"?: string,"kind"?: string,"lease_until"?: string | null,"mock"?: boolean,"owner_id"?: string | null,"result_code"?: string | null,"source_revision"?: number | null,"state"?: string,"trigger_kind"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "automation_events_kind_fkey"
      columns: ["kind"]
isOneToOne: false
      referencedRelation: "automation_policies"
      referencedColumns: ["kind"]
    },{
      foreignKeyName: "automation_events_owner_id_exhibition_id_fkey"
      columns: ["owner_id","exhibition_id"]
isOneToOne: false
      referencedRelation: "exhibitions"
      referencedColumns: ["owner_id","id"]
    }
                  ]
                },"automation_notify_signals": {
                  Row: {
                    "consumed_at": string | null,"created_at": string,"dedupe_key": string,"exhibition_id": string,"exhibition_revision": number,"expires_at": string,"id": string,"owner_id": string,"source_job_id": string | null,"source_mock": boolean | null,"source_revision": number,"trigger_kind": string
                  }
                  ComputedFields: never
                  Insert: {
                    "consumed_at"?: string | null,"created_at"?: string,"dedupe_key": string,"exhibition_id": string,"exhibition_revision": number,"expires_at"?: string,"id"?: string,"owner_id": string,"source_job_id"?: string | null,"source_mock"?: boolean | null,"source_revision": number,"trigger_kind": string
                  }
                  Update: {
                    "consumed_at"?: string | null,"created_at"?: string,"dedupe_key"?: string,"exhibition_id"?: string,"exhibition_revision"?: number,"expires_at"?: string,"id"?: string,"owner_id"?: string,"source_job_id"?: string | null,"source_mock"?: boolean | null,"source_revision"?: number,"trigger_kind"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "automation_notify_signals_owner_id_exhibition_id_fkey"
      columns: ["owner_id","exhibition_id"]
isOneToOne: false
      referencedRelation: "exhibitions"
      referencedColumns: ["owner_id","id"]
    }
                  ]
                },"automation_policies": {
                  Row: {
                    "allowed_categories": (string)[],"kind": string,"mode": string,"revision": number
                  }
                  ComputedFields: never
                  Insert: {
                    "allowed_categories"?: (string)[],"kind": string,"mode"?: string,"revision"?: number
                  }
                  Update: {
                    "allowed_categories"?: (string)[],"kind"?: string,"mode"?: string,"revision"?: number
                  }
                  Relationships: [

                  ]
                },"contact_consents": {
                  Row: {
                    "category": string,"granted": boolean,"owner_id": string,"revision": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"granted"?: boolean,"owner_id": string,"revision": number,"updated_at"?: string
                  }
                  Update: {
                    "category"?: string,"granted"?: boolean,"owner_id"?: string,"revision"?: number,"updated_at"?: string
                  }
                  Relationships: [

                  ]
                },"evidence_items": {
                  Row: {
                    "approved_at": string | null,"artwork_id": string | null,"body": string,"content_hash": string,"created_at": string,"exhibition_id": string,"id": string,"material_id": string | null,"material_version": number | null,"owner_id": string,"page_end": number | null,"page_start": number | null,"scope": string,"source_document_id": string | null,"source_kind": string,"source_label": string,"source_revision": number | null,"source_section_id": string | null,"state": string,"version": number,"withdrawn_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"artwork_id"?: string | null,"body": string,"content_hash": string,"created_at"?: string,"exhibition_id": string,"id": string,"material_id"?: string | null,"material_version"?: number | null,"owner_id": string,"page_end"?: number | null,"page_start"?: number | null,"scope": string,"source_document_id"?: string | null,"source_kind": string,"source_label": string,"source_revision"?: number | null,"source_section_id"?: string | null,"state"?: string,"version": number,"withdrawn_at"?: string | null
                  }
                  Update: {
                    "approved_at"?: string | null,"artwork_id"?: string | null,"body"?: string,"content_hash"?: string,"created_at"?: string,"exhibition_id"?: string,"id"?: string,"material_id"?: string | null,"material_version"?: number | null,"owner_id"?: string,"page_end"?: number | null,"page_start"?: number | null,"scope"?: string,"source_document_id"?: string | null,"source_kind"?: string,"source_label"?: string,"source_revision"?: number | null,"source_section_id"?: string | null,"state"?: string,"version"?: number,"withdrawn_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "evidence_items_material_id_fkey"
      columns: ["material_id"]
isOneToOne: false
      referencedRelation: "materials"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "evidence_items_owner_id_exhibition_id_artwork_id_fkey"
      columns: ["owner_id","exhibition_id","artwork_id"]
isOneToOne: false
      referencedRelation: "artworks"
      referencedColumns: ["owner_id","exhibition_id","id"]
    },{
      foreignKeyName: "evidence_items_owner_id_exhibition_id_fkey"
      columns: ["owner_id","exhibition_id"]
isOneToOne: false
      referencedRelation: "exhibitions"
      referencedColumns: ["owner_id","id"]
    },{
      foreignKeyName: "evidence_items_source_document_id_fkey"
      columns: ["source_document_id"]
isOneToOne: false
      referencedRelation: "knowledge_documents"
      referencedColumns: ["id"]
    }
                  ]
                },"exhibitions": {
                  Row: {
                    "artist_id": string,"authoring_step": string | null,"create_fingerprint": string,"created_at": string,"deleted_at": string | null,"end_date": string | null,"end_time": string | null,"id": string,"intro_evidence": NonNullable<Json>,"owner_id": string,"place": string | null,"poster_material_id": string | null,"public_artist_bio": string | null,"public_artist_display_name": string | null,"public_end_date": string | null,"public_end_time": string | null,"public_introduction": string | null,"public_place": string | null,"public_poster_material_id": string | null,"public_start_date": string | null,"public_start_time": string | null,"public_theme": string | null,"public_title": string | null,"revision": number,"start_date": string | null,"start_time": string | null,"state": string,"title": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "artist_id": string,"authoring_step"?: string | null,"create_fingerprint": string,"created_at"?: string,"deleted_at"?: string | null,"end_date"?: string | null,"end_time"?: string | null,"id": string,"intro_evidence"?: NonNullable<Json>,"owner_id": string,"place"?: string | null,"poster_material_id"?: string | null,"public_artist_bio"?: string | null,"public_artist_display_name"?: string | null,"public_end_date"?: string | null,"public_end_time"?: string | null,"public_introduction"?: string | null,"public_place"?: string | null,"public_poster_material_id"?: string | null,"public_start_date"?: string | null,"public_start_time"?: string | null,"public_theme"?: string | null,"public_title"?: string | null,"revision"?: number,"start_date"?: string | null,"start_time"?: string | null,"state"?: string,"title"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "artist_id"?: string,"authoring_step"?: string | null,"create_fingerprint"?: string,"created_at"?: string,"deleted_at"?: string | null,"end_date"?: string | null,"end_time"?: string | null,"id"?: string,"intro_evidence"?: NonNullable<Json>,"owner_id"?: string,"place"?: string | null,"poster_material_id"?: string | null,"public_artist_bio"?: string | null,"public_artist_display_name"?: string | null,"public_end_date"?: string | null,"public_end_time"?: string | null,"public_introduction"?: string | null,"public_place"?: string | null,"public_poster_material_id"?: string | null,"public_start_date"?: string | null,"public_start_time"?: string | null,"public_theme"?: string | null,"public_title"?: string | null,"revision"?: number,"start_date"?: string | null,"start_time"?: string | null,"state"?: string,"title"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "exhibitions_owner_id_artist_id_fkey"
      columns: ["owner_id","artist_id"]
isOneToOne: false
      referencedRelation: "artist_profiles"
      referencedColumns: ["owner_id","id"]
    },{
      foreignKeyName: "exhibitions_poster_material_fk"
      columns: ["owner_id","id","poster_material_id"]
isOneToOne: false
      referencedRelation: "materials"
      referencedColumns: ["owner_id","exhibition_id","id"]
    }
                  ]
                },"help_articles": {
                  Row: {
                    "body": string,"id": string,"published": boolean,"revision": number,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"id"?: string,"published"?: boolean,"revision"?: number,"title": string
                  }
                  Update: {
                    "body"?: string,"id"?: string,"published"?: boolean,"revision"?: number,"title"?: string
                  }
                  Relationships: [

                  ]
                },"knowledge_document_history": {
                  Row: {
                    "created_at": string,"document_id": string,"owner_id": string,"proposal_id": string,"revision": number,"sections": NonNullable<Json>,"source_refs": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"document_id": string,"owner_id": string,"proposal_id": string,"revision": number,"sections": NonNullable<Json>,"source_refs": NonNullable<Json>
                  }
                  Update: {
                    "created_at"?: string,"document_id"?: string,"owner_id"?: string,"proposal_id"?: string,"revision"?: number,"sections"?: NonNullable<Json>,"source_refs"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "knowledge_document_history_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "knowledge_documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "knowledge_document_history_proposal_id_fkey"
      columns: ["proposal_id"]
isOneToOne: true
      referencedRelation: "knowledge_proposals"
      referencedColumns: ["id"]
    }
                  ]
                },"knowledge_documents": {
                  Row: {
                    "artist_id": string | null,"artwork_id": string | null,"created_at": string,"exhibition_id": string | null,"id": string,"owner_id": string,"revision": number,"sections": NonNullable<Json>,"source_refs": NonNullable<Json>,"subject_id": string | null,"subject_type": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "artist_id"?: string | null,"artwork_id"?: string | null,"created_at"?: string,"exhibition_id"?: string | null,"id"?: string,"owner_id": string,"revision"?: number,"sections"?: NonNullable<Json>,"source_refs"?: NonNullable<Json>,"subject_id"?: never,"subject_type"?: never,"updated_at"?: string
                  }
                  Update: {
                    "artist_id"?: string | null,"artwork_id"?: string | null,"created_at"?: string,"exhibition_id"?: string | null,"id"?: string,"owner_id"?: string,"revision"?: number,"sections"?: NonNullable<Json>,"source_refs"?: NonNullable<Json>,"subject_id"?: never,"subject_type"?: never,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "knowledge_documents_owner_id_artist_id_fkey"
      columns: ["owner_id","artist_id"]
isOneToOne: false
      referencedRelation: "artist_profiles"
      referencedColumns: ["owner_id","id"]
    },{
      foreignKeyName: "knowledge_documents_owner_id_artwork_id_fkey"
      columns: ["owner_id","artwork_id"]
isOneToOne: false
      referencedRelation: "artworks"
      referencedColumns: ["owner_id","id"]
    },{
      foreignKeyName: "knowledge_documents_owner_id_exhibition_id_fkey"
      columns: ["owner_id","exhibition_id"]
isOneToOne: false
      referencedRelation: "exhibitions"
      referencedColumns: ["owner_id","id"]
    }
                  ]
                },"knowledge_proposals": {
                  Row: {
                    "applied_revision": number | null,"before_sections": NonNullable<Json>,"before_source_refs": NonNullable<Json>,"context_fingerprint": string,"created_at": string,"document_id": string,"expires_at": string,"id": string,"mock": boolean,"owner_id": string,"payload_purged_at": string | null,"proposal": NonNullable<Json>,"target_revision": number
                  }
                  ComputedFields: never
                  Insert: {
                    "applied_revision"?: number | null,"before_sections": NonNullable<Json>,"before_source_refs": NonNullable<Json>,"context_fingerprint": string,"created_at"?: string,"document_id": string,"expires_at": string,"id": string,"mock": boolean,"owner_id": string,"payload_purged_at"?: string | null,"proposal": NonNullable<Json>,"target_revision": number
                  }
                  Update: {
                    "applied_revision"?: number | null,"before_sections"?: NonNullable<Json>,"before_source_refs"?: NonNullable<Json>,"context_fingerprint"?: string,"created_at"?: string,"document_id"?: string,"expires_at"?: string,"id"?: string,"mock"?: boolean,"owner_id"?: string,"payload_purged_at"?: string | null,"proposal"?: NonNullable<Json>,"target_revision"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "knowledge_proposals_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "knowledge_documents"
      referencedColumns: ["id"]
    }
                  ]
                },"materials": {
                  Row: {
                    "artist_id": string | null,"artwork_id": string | null,"byte_size": number | null,"cleanup_after": string | null,"cleanup_pending": boolean,"content_hash": string | null,"content_type": string | null,"created_at": string,"deleted_at": string | null,"exhibition_id": string | null,"filename": string | null,"height": number | null,"id": string,"kind": string,"owner_id": string,"pages": number | null,"state": string,"storage_key": string | null,"text_body": string | null,"updated_at": string,"upload_expires_at": string | null,"upload_fingerprint": string | null,"version": number,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "artist_id"?: string | null,"artwork_id"?: string | null,"byte_size"?: number | null,"cleanup_after"?: string | null,"cleanup_pending"?: boolean,"content_hash"?: string | null,"content_type"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"exhibition_id"?: string | null,"filename"?: string | null,"height"?: number | null,"id"?: string,"kind": string,"owner_id": string,"pages"?: number | null,"state"?: string,"storage_key"?: string | null,"text_body"?: string | null,"updated_at"?: string,"upload_expires_at"?: string | null,"upload_fingerprint"?: string | null,"version"?: number,"width"?: number | null
                  }
                  Update: {
                    "artist_id"?: string | null,"artwork_id"?: string | null,"byte_size"?: number | null,"cleanup_after"?: string | null,"cleanup_pending"?: boolean,"content_hash"?: string | null,"content_type"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"exhibition_id"?: string | null,"filename"?: string | null,"height"?: number | null,"id"?: string,"kind"?: string,"owner_id"?: string,"pages"?: number | null,"state"?: string,"storage_key"?: string | null,"text_body"?: string | null,"updated_at"?: string,"upload_expires_at"?: string | null,"upload_fingerprint"?: string | null,"version"?: number,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "materials_owner_id_artist_id_fkey"
      columns: ["owner_id","artist_id"]
isOneToOne: false
      referencedRelation: "artist_profiles"
      referencedColumns: ["owner_id","id"]
    },{
      foreignKeyName: "materials_owner_id_artwork_id_fkey"
      columns: ["owner_id","artwork_id"]
isOneToOne: false
      referencedRelation: "artworks"
      referencedColumns: ["owner_id","id"]
    },{
      foreignKeyName: "materials_owner_id_exhibition_id_fkey"
      columns: ["owner_id","exhibition_id"]
isOneToOne: false
      referencedRelation: "exhibitions"
      referencedColumns: ["owner_id","id"]
    }
                  ]
                },"narration_approval_evidence": {
                  Row: {
                    "approval_id": string,"evidence_id": string,"evidence_version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "approval_id": string,"evidence_id": string,"evidence_version": number
                  }
                  Update: {
                    "approval_id"?: string,"evidence_id"?: string,"evidence_version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "narration_approval_evidence_approval_id_fkey"
      columns: ["approval_id"]
isOneToOne: false
      referencedRelation: "narration_approvals"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "narration_approval_evidence_evidence_id_evidence_version_fkey"
      columns: ["evidence_id","evidence_version"]
isOneToOne: false
      referencedRelation: "evidence_items"
      referencedColumns: ["id","version"]
    }
                  ]
                },"narration_approvals": {
                  Row: {
                    "approved_at": string,"approved_by": string,"artwork_id": string,"artwork_revision": number,"citations": NonNullable<Json>,"exhibition_id": string,"id": string,"narration_text": string,"owner_id": string,"text_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string,"approved_by": string,"artwork_id": string,"artwork_revision": number,"citations": NonNullable<Json>,"exhibition_id": string,"id"?: string,"narration_text": string,"owner_id": string,"text_hash": string
                  }
                  Update: {
                    "approved_at"?: string,"approved_by"?: string,"artwork_id"?: string,"artwork_revision"?: number,"citations"?: NonNullable<Json>,"exhibition_id"?: string,"id"?: string,"narration_text"?: string,"owner_id"?: string,"text_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "narration_approvals_owner_id_exhibition_id_artwork_id_fkey"
      columns: ["owner_id","exhibition_id","artwork_id"]
isOneToOne: false
      referencedRelation: "artworks"
      referencedColumns: ["owner_id","exhibition_id","id"]
    }
                  ]
                },"operators": {
                  Row: {
                    "enabled": boolean,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "enabled"?: boolean,"user_id": string
                  }
                  Update: {
                    "enabled"?: boolean,"user_id"?: string
                  }
                  Relationships: [

                  ]
                },"outbound_messages": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"binding_id": string | null,"binding_scope": string | null,"body": string,"category": string,"channel": string,"created_at": string,"destination_id": string | null,"dispatch_checked_at": string | null,"event_id": string,"id": string,"lease_until": string | null,"mock": boolean,"owner_id": string,"policy_revision": number,"provider_message_id": string | null,"result_code": string | null,"revision": number,"send_attempt": string | null,"state": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"binding_id"?: string | null,"binding_scope"?: string | null,"body": string,"category": string,"channel": string,"created_at"?: string,"destination_id"?: string | null,"dispatch_checked_at"?: string | null,"event_id": string,"id"?: string,"lease_until"?: string | null,"mock": boolean,"owner_id": string,"policy_revision": number,"provider_message_id"?: string | null,"result_code"?: string | null,"revision"?: number,"send_attempt"?: string | null,"state": string
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"binding_id"?: string | null,"binding_scope"?: string | null,"body"?: string,"category"?: string,"channel"?: string,"created_at"?: string,"destination_id"?: string | null,"dispatch_checked_at"?: string | null,"event_id"?: string,"id"?: string,"lease_until"?: string | null,"mock"?: boolean,"owner_id"?: string,"policy_revision"?: number,"provider_message_id"?: string | null,"result_code"?: string | null,"revision"?: number,"send_attempt"?: string | null,"state"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "outbound_messages_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "operators"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "outbound_messages_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "automation_events"
      referencedColumns: ["id"]
    }
                  ]
                },"publication_evidence_refs": {
                  Row: {
                    "evidence_id": string,"evidence_version": number,"publication_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "evidence_id": string,"evidence_version": number,"publication_id": string
                  }
                  Update: {
                    "evidence_id"?: string,"evidence_version"?: number,"publication_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "publication_evidence_refs_evidence_id_evidence_version_fkey"
      columns: ["evidence_id","evidence_version"]
isOneToOne: false
      referencedRelation: "evidence_items"
      referencedColumns: ["id","version"]
    },{
      foreignKeyName: "publication_evidence_refs_publication_id_fkey"
      columns: ["publication_id"]
isOneToOne: false
      referencedRelation: "publications"
      referencedColumns: ["id"]
    }
                  ]
                },"publication_requests": {
                  Row: {
                    "fingerprint": string,"owner_id": string,"request_id": string,"result": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "fingerprint": string,"owner_id": string,"request_id": string,"result": NonNullable<Json>
                  }
                  Update: {
                    "fingerprint"?: string,"owner_id"?: string,"request_id"?: string,"result"?: NonNullable<Json>
                  }
                  Relationships: [

                  ]
                },"publications": {
                  Row: {
                    "approved_at": string,"approved_by": string,"artwork_id": string,"audio_key": string | null,"audio_text_hash": string | null,"creation_year": string | null,"dimensions": string | null,"evidence": NonNullable<Json>,"exhibition_id": string,"id": string,"image_key": string | null,"medium": string | null,"narration_citations": NonNullable<Json>,"narration_hash": string,"narration_text": string,"number": number,"owner_id": string,"revoked_at": string | null,"title": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string,"approved_by": string,"artwork_id": string,"audio_key"?: string | null,"audio_text_hash"?: string | null,"creation_year"?: string | null,"dimensions"?: string | null,"evidence": NonNullable<Json>,"exhibition_id": string,"id"?: string,"image_key"?: string | null,"medium"?: string | null,"narration_citations"?: NonNullable<Json>,"narration_hash": string,"narration_text": string,"number": number,"owner_id": string,"revoked_at"?: string | null,"title": string,"version": number
                  }
                  Update: {
                    "approved_at"?: string,"approved_by"?: string,"artwork_id"?: string,"audio_key"?: string | null,"audio_text_hash"?: string | null,"creation_year"?: string | null,"dimensions"?: string | null,"evidence"?: NonNullable<Json>,"exhibition_id"?: string,"id"?: string,"image_key"?: string | null,"medium"?: string | null,"narration_citations"?: NonNullable<Json>,"narration_hash"?: string,"narration_text"?: string,"number"?: number,"owner_id"?: string,"revoked_at"?: string | null,"title"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "publications_owner_id_exhibition_id_artwork_id_fkey"
      columns: ["owner_id","exhibition_id","artwork_id"]
isOneToOne: false
      referencedRelation: "artworks"
      referencedColumns: ["owner_id","exhibition_id","id"]
    }
                  ]
                },"qa_gaps": {
                  Row: {
                    "artwork_id": string,"closed_recheck_publication_id": string | null,"created_at": string,"exhibition_id": string,"expires_at": string,"id": string,"occurrences": number,"publication_id": string,"publication_version": number,"question": string,"question_key": string,"recheck_at": string | null,"recheck_publication_id": string | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "artwork_id": string,"closed_recheck_publication_id"?: string | null,"created_at"?: string,"exhibition_id": string,"expires_at": string,"id"?: string,"occurrences"?: number,"publication_id": string,"publication_version": number,"question": string,"question_key": string,"recheck_at"?: string | null,"recheck_publication_id"?: string | null,"status"?: string
                  }
                  Update: {
                    "artwork_id"?: string,"closed_recheck_publication_id"?: string | null,"created_at"?: string,"exhibition_id"?: string,"expires_at"?: string,"id"?: string,"occurrences"?: number,"publication_id"?: string,"publication_version"?: number,"question"?: string,"question_key"?: string,"recheck_at"?: string | null,"recheck_publication_id"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "qa_gaps_exhibition_id_artwork_id_publication_id_fkey"
      columns: ["exhibition_id","artwork_id","publication_id"]
isOneToOne: false
      referencedRelation: "publications"
      referencedColumns: ["exhibition_id","artwork_id","id"]
    },{
      foreignKeyName: "qa_gaps_exhibition_id_artwork_id_recheck_publication_id_fkey"
      columns: ["exhibition_id","artwork_id","recheck_publication_id"]
isOneToOne: false
      referencedRelation: "publications"
      referencedColumns: ["exhibition_id","artwork_id","id"]
    }
                  ]
                },"support_inquiries": {
                  Row: {
                    "binding_revision": number | null,"channel_id": string,"chat_id": string,"completion_fingerprint": string | null,"context_revision": string | null,"event_id": string,"expires_at": string,"id": string,"message_id": string,"mock": boolean,"owner_id": string | null,"provider_created_at": string,"question": string | null,"truncated": boolean,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "binding_revision"?: number | null,"channel_id": string,"chat_id": string,"completion_fingerprint"?: string | null,"context_revision"?: string | null,"event_id": string,"expires_at": string,"id"?: string,"message_id": string,"mock": boolean,"owner_id"?: string | null,"provider_created_at": string,"question"?: string | null,"truncated": boolean,"user_id": string
                  }
                  Update: {
                    "binding_revision"?: number | null,"channel_id"?: string,"chat_id"?: string,"completion_fingerprint"?: string | null,"context_revision"?: string | null,"event_id"?: string,"expires_at"?: string,"id"?: string,"message_id"?: string,"mock"?: boolean,"owner_id"?: string | null,"provider_created_at"?: string,"question"?: string | null,"truncated"?: boolean,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "support_inquiries_event_id_fkey"
      columns: ["event_id"]
isOneToOne: true
      referencedRelation: "automation_events"
      referencedColumns: ["id"]
    }
                  ]
                },"visitor_audio_assets": {
                  Row: {
                    "cleanup_after": string | null,"cleanup_claimed": boolean,"id": string,"storage_key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cleanup_after"?: string | null,"cleanup_claimed"?: boolean,"id": string,"storage_key": string
                  }
                  Update: {
                    "cleanup_after"?: string | null,"cleanup_claimed"?: boolean,"id"?: string,"storage_key"?: string
                  }
                  Relationships: [

                  ]
                },"visitor_quota_events": {
                  Row: {
                    "exhibition_id": string,"reserved_at": string,"session_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "exhibition_id": string,"reserved_at": string,"session_hash": string
                  }
                  Update: {
                    "exhibition_id"?: string,"reserved_at"?: string,"session_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "visitor_quota_events_exhibition_id_fkey"
      columns: ["exhibition_id"]
isOneToOne: false
      referencedRelation: "exhibitions"
      referencedColumns: ["id"]
    }
                  ]
                },"voice_configs": {
                  Row: {
                    "fingerprint": string,"mock": boolean,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "fingerprint": string,"mock": boolean,"version": number
                  }
                  Update: {
                    "fingerprint"?: string,"mock"?: boolean,"version"?: number
                  }
                  Relationships: [

                  ]
                },"withdrawn_evidence_sources": {
                  Row: {
                    "owner_id": string,"source_key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "owner_id": string,"source_key": string
                  }
                  Update: {
                    "owner_id"?: string,"source_key"?: string
                  }
                  Relationships: [

                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "acquire_notification_run":
{ Args: { "p_mock": boolean,"p_token": string }; Returns: Json
                           },
"advance_exhibition_step":
{ Args: { "p_expected_revision": number,"p_id": string,"p_step": string }; Returns: Json
                           },
"approve_evidence":
{ Args: { "p_evidence_id": string,"p_version": number }; Returns: Json
                           },
"approve_narration":
{ Args: { "p_artwork_id": string,"p_citations": Json,"p_expected_revision": number }; Returns: Json
                           },
"approve_qa_item":
{ Args: { "p_evidence_pins": Json,"p_expected_version": number,"p_item_id": string }; Returns: Json
                           },
"check_notification_dispatch":
{ Args: { "p_attempt": string,"p_id": string,"p_mock": boolean,"p_token": string }; Returns: Json
                           },
"check_outbound_dispatch":
{ Args: { "p_attempt": string,"p_id": string,"p_mock": boolean }; Returns: Json
                           },
"check_publication_versions":
{ Args: { "p_exhibition_id": string,"p_publications": Json }; Returns: Json
                           },
"claim_automation_events":
{ Args: { "p_limit": number,"p_mock": boolean }; Returns: Json
                           },
"claim_automation_notifications":
{ Args: { "p_limit": number,"p_mock": boolean }; Returns: Json
                           },
"claim_channel_token":
{ Args: { "p_app_id": string,"p_channel_id": string,"p_claim": string }; Returns: Json
                           },
"claim_notification_outbound":
{ Args: { "p_limit": number,"p_mock": boolean }; Returns: Json
                           },
"claim_outbound_messages":
{ Args: { "p_limit": number,"p_mock": boolean }; Returns: Json
                           },
"claim_support_events":
{ Args: { "p_channel_id": string,"p_limit": number,"p_mock": boolean }; Returns: Json
                           },
"claim_support_outbound":
{ Args: { "p_channel_id": string,"p_limit": number,"p_mock": boolean }; Returns: Json
                           },
"claim_training_target":
{ Args: { "p_batch_id": string,"p_expected_attempt": number,"p_mock": boolean,"p_owner": string,"p_request_id": string,"p_target_id": string }; Returns: Json
                           },
"close_gap_recheck":
{ Args: { "p_enabled": boolean,"p_expected_publication_id": string,"p_id": string,"p_owner": string }; Returns: Json
                           },
"commit_proposal":
{ Args: { "p_id": string,"p_reviewed": boolean }; Returns: Json
                           },
"complete_ai_job":
{ Args: { "p_attempt": number,"p_job_id": string,"p_owner": string,"p_result": Json }; Returns: Json
                           },
"complete_artwork_interview":
{ Args: { "p_attempt": number,"p_job_id": string,"p_owner": string,"p_result": Json }; Returns: Json
                           },
"complete_audio_cleanup":
{ Args: { "p_id": string,"p_owner": string }; Returns: boolean
                           },
"complete_audio_job":
{ Args: { "p_attempt": number,"p_job_id": string,"p_owner": string,"p_result": Json }; Returns: Json
                           },
"complete_automation_event":
{ Args: { "p_attempt": number,"p_id": string,"p_outbound"?: Json,"p_result_code": string,"p_state": string }; Returns: Json
                           },
"complete_automation_job":
{ Args: { "p_attempt": number,"p_elapsed_ms"?: number,"p_event_id": string,"p_job_id": string,"p_outbound"?: Json,"p_result_code": string,"p_state": string,"p_steps"?: Json,"p_usage"?: Json }; Returns: Json
                           },
"complete_channel_token":
{ Args: { "p_app_id": string,"p_channel_id": string,"p_claim": string,"p_expires_in": number,"p_sealed": string }; Returns: boolean
                           },
"complete_expected_qa_job":
{ Args: { "p_attempt": number,"p_job_id": string,"p_owner": string,"p_result": Json }; Returns: Json
                           },
"complete_material_cleanup":
{ Args: { "p_expected_version": number,"p_id": string,"p_owner": string }; Returns: Json
                           },
"complete_material_read":
{ Args: { "p_chunks": Json,"p_method": string,"p_owner": string,"p_read_id": string,"p_request_id": string,"p_result_code": string }; Returns: Json
                           },
"complete_notification_dispatch":
{ Args: { "p_attempt": string,"p_id": string,"p_mock": boolean,"p_provider_id": string,"p_result_code": string,"p_status": string,"p_token": string }; Returns: Json
                           },
"complete_organize_job":
{ Args: { "p_attempt": number,"p_job_id": string,"p_owner": string,"p_result": Json }; Returns: Json
                           },
"complete_outbound_message":
{ Args: { "p_attempt": string,"p_id": string,"p_provider_id": string,"p_result_code": string,"p_status": string }; Returns: Json
                           },
"complete_preview_answer":
{ Args: { "p_answer_id": string,"p_attempt": number,"p_owner": string,"p_result": Json }; Returns: Json
                           },
"complete_preview_voice":
{ Args: { "p_audio": string,"p_failure": string,"p_id": string,"p_owner": string,"p_result": Json }; Returns: Json
                           },
"complete_qa_rewrite_job":
{ Args: { "p_attempt": number,"p_job_id": string,"p_owner": string,"p_result": Json }; Returns: Json
                           },
"complete_support_job":
{ Args: { "p_attempt": number,"p_body": string,"p_category": string,"p_context_revision": string,"p_elapsed_ms": number,"p_event_id": string,"p_job_id": string,"p_mock": boolean,"p_result_code": string,"p_state": string,"p_steps": Json,"p_usage": Json }; Returns: Json
                           },
"complete_upload":
{ Args: { "p_byte_size": number,"p_content_hash": string,"p_content_type": string,"p_expected_version": number,"p_height": number,"p_id": string,"p_owner": string,"p_pages": number,"p_width": number }; Returns: Json
                           },
"complete_visitor_audio_cleanup":
{ Args: { "p_id": string }; Returns: boolean
                           },
"complete_visitor_request":
{ Args: { "p_failure_code"?: string,"p_id": string,"p_result": Json,"p_session_hash": string,"p_steps"?: Json }; Returns: Json
                           },
"complete_visitor_voice":
{ Args: { "p_failure_code"?: string,"p_id": string,"p_result": Json,"p_session_hash": string }; Returns: Json
                           },
"consume_signup_budget":
{ Args: { "p_email_hash": string,"p_kind": string,"p_network_hash": string,"p_request_id": string }; Returns: undefined
                           },
"consume_visitor_network_budget":
{ Args: { "p_exhibition_id": string,"p_kind": string,"p_network_hash": string,"p_request_id": string,"p_session_hash": string }; Returns: undefined
                           },
"create_artwork":
{ Args: { "p_creation_year": string,"p_dimensions": string,"p_exhibition_id": string,"p_id": string,"p_medium": string,"p_number": number,"p_sections": Json,"p_source_refs": Json,"p_title": string }; Returns: Json
                           },
"create_artwork_draft":
{ Args: { "p_creation_year": string,"p_dimensions": string,"p_dimensions_unit": string,"p_exhibition_id": string,"p_id": string,"p_medium": string,"p_number": number,"p_sections": Json,"p_source_refs": Json,"p_title": string }; Returns: Json
                           },
"create_exhibition":
{ Args: { "p_end_date": string,"p_id": string,"p_place": string,"p_sections": Json,"p_source_refs": Json,"p_start_date": string,"p_title": string }; Returns: Json
                           },
"create_exhibition_draft":
{ Args: { "p_end_date": string,"p_end_time": string,"p_id": string,"p_place": string,"p_sections": Json,"p_source_refs": Json,"p_start_date": string,"p_start_time": string,"p_title": string }; Returns: Json
                           },
"create_qa_correction_evidence":
{ Args: { "p_request_id": string,"p_source_body": string,"p_source_label": string,"p_target_id": string,"p_target_kind": string,"p_target_version": number }; Returns: Json
                           },
"create_training_batch":
{ Args: { "p_exhibition_id": string,"p_expected_revision": number,"p_include_exhibition_qa": boolean,"p_owner": string,"p_request_id": string }; Returns: Json
                           },
"decide_outbox":
{ Args: { "p_approve": boolean,"p_expected_revision": number,"p_id": string }; Returns: Json
                           },
"delete_artwork":
{ Args: { "p_expected_revision": number,"p_id": string }; Returns: Json
                           },
"delete_material":
{ Args: { "p_expected_version": number,"p_id": string }; Returns: Json
                           },
"dismiss_gap":
{ Args: { "p_enabled": boolean,"p_id": string,"p_owner": string }; Returns: Json
                           },
"enqueue_automation_event":
{ Args: { "p_dedupe_key": string,"p_exhibition_id": string,"p_kind": string,"p_mock": boolean,"p_owner": string,"p_source_revision": number,"p_trigger_kind": string }; Returns: Json
                           },
"get_ai_job":
{ Args: { "p_job_id": string }; Returns: Json
                           },
"get_approved_qa_for_publication":
{ Args: { "p_allow_mock"?: boolean,"p_artwork_id": string,"p_exhibition_id": string,"p_owner": string }; Returns: Json
                           },
"get_artist_profile":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_artwork":
{ Args: { "p_id": string }; Returns: Json
                           },
"get_audio_context":
{ Args: { "p_attempt": number,"p_job_id": string,"p_owner": string }; Returns: Json
                           },
"get_contact_consents":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_exhibition":
{ Args: { "p_id": string }; Returns: Json
                           },
"get_expected_qa_job":
{ Args: { "p_job_id": string }; Returns: Json
                           },
"get_knowledge_document":
{ Args: { "p_subject_id": string,"p_subject_type": string }; Returns: Json
                           },
"get_latest_training_batch":
{ Args: { "p_exhibition_id": string }; Returns: Json
                           },
"get_material_read":
{ Args: { "p_request_id": string }; Returns: Json
                           },
"get_narration_context":
{ Args: { "p_artwork_id": string }; Returns: Json
                           },
"get_notification_context":
{ Args: { "p_attempt": number,"p_event_id": string,"p_mock": boolean }; Returns: Json
                           },
"get_organize_context":
{ Args: { "p_document_id": string }; Returns: Json
                           },
"get_preview_answer":
{ Args: { "p_answer_id": string }; Returns: Json
                           },
"get_public_artwork":
{ Args: { "p_exhibition_id": string,"p_id": string }; Returns: Json
                           },
"get_public_exhibition":
{ Args: { "p_id": string }; Returns: Json
                           },
"get_public_media":
{ Args: { "p_kind": string,"p_mock": boolean,"p_publication_id": string }; Returns: Json
                           },
"get_public_media_refs":
{ Args: { "p_mock": boolean,"p_publication_ids": (string)[] }; Returns: Json
                           },
"get_publication_checklist":
{ Args: { "p_exhibition_id": string }; Returns: Json
                           },
"get_qa_rewrite_job":
{ Args: { "p_job_id": string }; Returns: Json
                           },
"get_review_bundle":
{ Args: { "p_artwork_id": string }; Returns: Json
                           },
"get_revoke_impact":
{ Args: { "p_evidence_id": string,"p_expected_version": number }; Returns: Json
                           },
"get_signup_verification_identity":
{ Args: { "p_email": string,"p_signup_request_id": string }; Returns: string
                           },
"get_support_context":
{ Args: { "p_attempt": number,"p_event_id": string,"p_mock": boolean }; Returns: Json
                           },
"get_training_batch":
{ Args: { "p_batch_id": string }; Returns: Json
                           },
"get_upload":
{ Args: { "p_allow_cleanup"?: boolean,"p_id": string,"p_owner": string }; Returns: Json
                           },
"get_visitor_answer_exhibition":
{ Args: { "p_id": string,"p_session_hash": string }; Returns: string
                           },
"is_publication_current":
{ Args: { "p_artwork_id": string,"p_exhibition_id": string,"p_publication_id": string,"p_version": number }; Returns: boolean
                           },
"list_artwork_interview":
{ Args: { "p_artwork_id": string }; Returns: Json
                           },
"list_artworks":
{ Args: { "p_exhibition_id": string }; Returns: Json
                           },
"list_audio_cleanup":
{ Args: { "p_limit"?: number }; Returns: Json
                           },
"list_document_history":
{ Args: { "p_before_revision": number,"p_document_id": string,"p_limit": number }; Returns: Json
                           },
"list_exhibitions":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"list_gaps":
{ Args: { "p_enabled": boolean,"p_exhibition_id": string,"p_owner": string }; Returns: Json
                           },
"list_labels":
{ Args: { "p_exhibition_id": string }; Returns: Json
                           },
"list_material_cleanup":
{ Args: { "p_limit"?: number }; Returns: Json
                           },
"list_materials":
{ Args: { "p_subject_id": string,"p_subject_type": string }; Returns: Json
                           },
"list_outbox":
{ Args: { "p_limit"?: number }; Returns: Json
                           },
"list_outbox_page":
{ Args: { "p_before"?: string,"p_limit"?: number,"p_state"?: string }; Returns: Json
                           },
"list_qa_items":
{ Args: { "p_artwork_id": string,"p_exhibition_id": string }; Returns: Json
                           },
"list_visitor_audio_cleanup":
{ Args: { "p_limit"?: number }; Returns: Json
                           },
"load_preview_voice":
{ Args: { "p_id": string,"p_owner": string }; Returns: Json
                           },
"load_proposal":
{ Args: { "p_id": string }; Returns: Json
                           },
"load_publication_context":
{ Args: { "p_artwork_id": string,"p_exhibition_id": string,"p_number": number }; Returns: Json
                           },
"load_visitor_answer":
{ Args: { "p_id": string,"p_session_hash": string }; Returns: Json
                           },
"load_visitor_voice":
{ Args: { "p_id": string,"p_session_hash": string }; Returns: Json
                           },
"pause":
{ Args: { "p_artwork_id"?: string,"p_exhibition_id": string,"p_expected_revision": number }; Returns: Json
                           },
"publish":
{ Args: { "p_artworks": Json,"p_exhibition_id": string,"p_expected_revision": number,"p_intro": Json,"p_owner": string,"p_request_id": string,"p_voice_required": boolean }; Returns: Json
                           },
"publish_with_audio_config":
{ Args: { "p_artworks": Json,"p_exhibition_id": string,"p_expected_revision": number,"p_intro": Json,"p_mock": boolean,"p_owner": string,"p_request_id": string,"p_voice_fingerprint": string,"p_voice_required": boolean }; Returns: Json
                           },
"purge_expired":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"receive_support_inquiry":
{ Args: { "p_channel_id": string,"p_chat_id": string,"p_created_at": string,"p_message_id": string,"p_mock": boolean,"p_question": string,"p_truncated": boolean,"p_user_id": string }; Returns: Json
                           },
"record_gap":
{ Args: { "p_enabled": boolean,"p_question": string,"p_request_id": string,"p_session_hash": string }; Returns: boolean
                           },
"record_preview_evaluation":
{ Args: { "p_answer_id": string,"p_rating": string,"p_request_id": string }; Returns: Json
                           },
"record_visitor_execution":
{ Args: { "p_elapsed_ms": number,"p_id": string,"p_session_hash": string,"p_steps": Json,"p_usage": Json }; Returns: undefined
                           },
"record_visitor_steps":
{ Args: { "p_id": string,"p_session_hash": string,"p_steps": Json }; Returns: undefined
                           },
"release_notification_run":
{ Args: { "p_mock": boolean,"p_token": string }; Returns: undefined
                           },
"reorder_artworks":
{ Args: { "p_exhibition_id": string,"p_items": Json }; Returns: Json
                           },
"request_upload":
{ Args: { "p_byte_size": number,"p_content_type": string,"p_filename": string,"p_id": string,"p_kind": string,"p_owner": string,"p_subject_id": string,"p_subject_type": string }; Returns: Json
                           },
"reserve_ai_job":
{ Args: { "p_artwork_id": string,"p_expected_document_revision": number,"p_expected_revision": number,"p_owner": string,"p_request_id": string,"p_strategy": string }; Returns: Json
                           } |
{ Args: { "p_artwork_id": string,"p_expected_document_revision": number,"p_expected_revision": number,"p_mock": boolean,"p_owner": string,"p_request_id": string,"p_strategy": string }; Returns: Json
                           },
"reserve_artwork_interview":
{ Args: { "p_artwork_id": string,"p_mock": boolean,"p_owner": string,"p_request_id": string }; Returns: Json
                           },
"reserve_audio_job":
{ Args: { "p_approval_id": string,"p_artwork_id": string,"p_expected_revision": number,"p_mock": boolean,"p_owner": string,"p_request_id": string,"p_voice_fingerprint": string }; Returns: Json
                           },
"reserve_automation_job":
{ Args: { "p_event_attempt": number,"p_event_id": string,"p_mock": boolean }; Returns: Json
                           },
"reserve_expected_qa_job":
{ Args: { "p_artwork_id": string,"p_exhibition_id": string,"p_expected_document_revision": number,"p_expected_revision": number,"p_mock": boolean,"p_owner": string,"p_request_id": string }; Returns: Json
                           },
"reserve_material_read":
{ Args: { "p_document_id": string,"p_expected_document_revision": number,"p_expected_version": number,"p_material_id": string,"p_mock": boolean,"p_owner": string,"p_request_id": string }; Returns: Json
                           },
"reserve_organize_job":
{ Args: { "p_document_id": string,"p_expected_document_revision": number,"p_mock": boolean,"p_owner": string,"p_request_id": string }; Returns: Json
                           },
"reserve_preview_answer":
{ Args: { "p_artwork_id": string,"p_exhibition_id": string,"p_mock": boolean,"p_owner": string,"p_question": string,"p_request_id": string }; Returns: Json
                           },
"reserve_preview_voice":
{ Args: { "p_answer": string,"p_exhibition": string,"p_hash": string,"p_kind": string,"p_mock": boolean,"p_owner": string,"p_request": string }; Returns: Json
                           },
"reserve_qa_rewrite_job":
{ Args: { "p_evidence_pins": Json,"p_instruction": string,"p_mock": boolean,"p_owner": string,"p_request_id": string,"p_target_id": string,"p_target_kind": string,"p_target_version": number }; Returns: Json
                           },
"reserve_visitor_request":
{ Args: { "p_exhibition_id": string,"p_input_hash": string,"p_mock": boolean,"p_request_id": string,"p_session_hash": string }; Returns: Json
                           },
"reserve_visitor_voice":
{ Args: { "p_answer_id"?: string,"p_exhibition_id": string,"p_input_hash": string,"p_kind": string,"p_mock": boolean,"p_request_id": string,"p_session_hash": string,"p_voice_fingerprint"?: string }; Returns: Json
                           },
"resume":
{ Args: { "p_artwork_id"?: string,"p_exhibition_id": string,"p_expected_revision": number,"p_owner": string,"p_voice_required": boolean }; Returns: Json
                           },
"resume_with_audio_mode":
{ Args: { "p_artwork_id"?: string,"p_exhibition_id": string,"p_expected_revision": number,"p_mock": boolean,"p_owner": string,"p_voice_required": boolean }; Returns: Json
                           },
"retry_ai_job":
{ Args: { "p_expected_attempt": number,"p_job_id": string,"p_owner": string,"p_request_id": string }; Returns: Json
                           } |
{ Args: { "p_expected_attempt": number,"p_job_id": string,"p_mock": boolean,"p_owner": string,"p_request_id": string }; Returns: Json
                           },
"retry_audio_job":
{ Args: { "p_expected_attempt": number,"p_job_id": string,"p_mock": boolean,"p_owner": string,"p_request_id": string,"p_voice_fingerprint": string }; Returns: Json
                           },
"retry_expected_qa_job":
{ Args: { "p_expected_attempt": number,"p_job_id": string,"p_mock": boolean,"p_owner": string,"p_request_id": string }; Returns: Json
                           },
"retry_organize_job":
{ Args: { "p_expected_attempt": number,"p_job_id": string,"p_mock": boolean,"p_owner": string,"p_request_id": string }; Returns: Json
                           },
"retry_qa_rewrite_job":
{ Args: { "p_expected_attempt": number,"p_job_id": string,"p_mock": boolean,"p_owner": string,"p_request_id": string }; Returns: Json
                           },
"revoke_evidence":
{ Args: { "p_evidence_id": string,"p_expected_version": number,"p_impact_token": string }; Returns: Json
                           },
"save_artwork_interview_answer":
{ Args: { "p_answer": string,"p_approve": boolean,"p_artwork_id": string,"p_expected_version": number,"p_question_id": string,"p_skip": boolean }; Returns: Json
                           },
"save_narration_draft":
{ Args: { "p_artwork_id": string,"p_expected_revision": number,"p_source_job_id"?: string,"p_text": string }; Returns: Json
                           },
"schedule_automation_notifications":
{ Args: { "p_limit": number,"p_mock": boolean }; Returns: Json
                           },
"set_artist_avatar":
{ Args: { "p_expected_revision": number,"p_material_id": string }; Returns: Json
                           },
"set_artwork_image":
{ Args: { "p_artwork_id": string,"p_expected_revision": number,"p_material_id": string }; Returns: Json
                           },
"set_contact_consent":
{ Args: { "p_category": string,"p_expected_revision": number,"p_granted": boolean }; Returns: Json
                           },
"set_exhibition_poster":
{ Args: { "p_expected_revision": number,"p_id": string,"p_material_id": string }; Returns: Json
                           },
"set_support_binding":
{ Args: { "p_channel_id": string,"p_enabled": boolean,"p_expected_revision": number,"p_owner": string,"p_user_id": string }; Returns: Json
                           },
"sync_audio_config":
{ Args: { "p_fingerprint": string,"p_mock": boolean }; Returns: number
                           },
"update_artist_onboarding":
{ Args: { "p_complete": boolean,"p_display_name": string,"p_expected_revision": number,"p_full_name": string,"p_keywords": Json }; Returns: Json
                           },
"update_artist_profile":
{ Args: { "p_display_name": string,"p_expected_document_revision": number,"p_expected_revision": number,"p_sections": Json,"p_source_refs": Json }; Returns: Json
                           },
"update_artwork":
{ Args: { "p_creation_year": string,"p_dimensions": string,"p_expected_document_revision": number,"p_expected_revision": number,"p_id": string,"p_medium": string,"p_number": number,"p_sections": Json,"p_source_refs": Json,"p_title": string }; Returns: Json
                           },
"update_artwork_draft":
{ Args: { "p_creation_year": string,"p_dimensions": string,"p_dimensions_unit": string,"p_expected_document_revision": number,"p_expected_revision": number,"p_id": string,"p_medium": string,"p_number": number,"p_sections": Json,"p_source_refs": Json,"p_title": string }; Returns: Json
                           },
"update_exhibition":
{ Args: { "p_end_date": string,"p_expected_document_revision": number,"p_expected_revision": number,"p_id": string,"p_place": string,"p_sections": Json,"p_source_refs": Json,"p_start_date": string,"p_title": string }; Returns: Json
                           },
"update_exhibition_draft":
{ Args: { "p_end_date": string,"p_end_time": string,"p_expected_document_revision": number,"p_expected_revision": number,"p_id": string,"p_place": string,"p_sections": Json,"p_source_refs": Json,"p_start_date": string,"p_start_time": string,"p_title": string }; Returns: Json
                           },
"update_knowledge_document":
{ Args: { "p_expected_revision": number,"p_sections": Json,"p_source_refs": Json,"p_subject_id": string,"p_subject_type": string }; Returns: Json
                           },
"upsert_evidence":
{ Args: { "p_artwork_id": string,"p_body": string,"p_evidence_id"?: string,"p_exhibition_id": string,"p_expected_version"?: number,"p_scope": string,"p_source": Json,"p_source_label": string }; Returns: Json
                           },
"withdraw_qa_item":
{ Args: { "p_expected_version": number,"p_item_id": string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {

          }
        }
} as const
