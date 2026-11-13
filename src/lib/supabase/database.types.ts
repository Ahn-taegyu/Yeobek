
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {

  "public": {
          Tables: {
            "ai_job_attempts": {
                  Row: {
                    "attempt": number,"completed_at": string | null,"completion_fingerprint": string | null,"duration_ms": number | null,"job_id": string,"owner_id": string,"request_id": string,"reserved_at": string,"result_code": string | null,"steps": Json | null,"usage": Json | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt": number,"completed_at"?: string | null,"completion_fingerprint"?: string | null,"duration_ms"?: number | null,"job_id": string,"owner_id": string,"request_id": string,"reserved_at"?: string,"result_code"?: string | null,"steps"?: Json | null,"usage"?: Json | null
                  }
                  Update: {
                    "attempt"?: number,"completed_at"?: string | null,"completion_fingerprint"?: string | null,"duration_ms"?: number | null,"job_id"?: string,"owner_id"?: string,"request_id"?: string,"reserved_at"?: string,"result_code"?: string | null,"steps"?: Json | null,"usage"?: Json | null
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
                    "artwork_id": string,"attempt": number,"created_at": string,"document_id": string,"expected_document_revision": number,"expected_revision": number,"expires_at": string,"id": string,"kind": string,"lease_until": string,"mock": boolean,"owner_id": string,"request_id": string,"result": Json | null,"result_code": string | null,"routing": string,"source_fingerprint": NonNullable<Json>,"source_ids": NonNullable<Json>,"status": string,"strategy": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "artwork_id": string,"attempt"?: number,"created_at"?: string,"document_id": string,"expected_document_revision": number,"expected_revision": number,"expires_at": string,"id"?: string,"kind"?: string,"lease_until": string,"mock"?: boolean,"owner_id": string,"request_id": string,"result"?: Json | null,"result_code"?: string | null,"routing"?: string,"source_fingerprint": NonNullable<Json>,"source_ids": NonNullable<Json>,"status"?: string,"strategy": string,"updated_at"?: string
                  }
                  Update: {
                    "artwork_id"?: string,"attempt"?: number,"created_at"?: string,"document_id"?: string,"expected_document_revision"?: number,"expected_revision"?: number,"expires_at"?: string,"id"?: string,"kind"?: string,"lease_until"?: string,"mock"?: boolean,"owner_id"?: string,"request_id"?: string,"result"?: Json | null,"result_code"?: string | null,"routing"?: string,"source_fingerprint"?: NonNullable<Json>,"source_ids"?: NonNullable<Json>,"status"?: string,"strategy"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_jobs_owner_id_artwork_id_fkey"
      columns: ["owner_id","artwork_id"]
isOneToOne: false
      referencedRelation: "artworks"
      referencedColumns: ["owner_id","id"]
    }
                  ]
                },"api_requests": {
                  Row: {
                    "answer_text": string | null,"artwork_id": string | null,"created_at": string,"exhibition_id": string,"expires_at": string,"kind": string,"publication_id": string | null,"reply_audio_key": string | null,"request_id": string,"session_hash": string,"state": string,"updated_at": string,"usage": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "answer_text"?: string | null,"artwork_id"?: string | null,"created_at"?: string,"exhibition_id": string,"expires_at"?: string,"kind": string,"publication_id"?: string | null,"reply_audio_key"?: string | null,"request_id": string,"session_hash": string,"state"?: string,"updated_at"?: string,"usage"?: NonNullable<Json>
                  }
                  Update: {
                    "answer_text"?: string | null,"artwork_id"?: string | null,"created_at"?: string,"exhibition_id"?: string,"expires_at"?: string,"kind"?: string,"publication_id"?: string | null,"reply_audio_key"?: string | null,"request_id"?: string,"session_hash"?: string,"state"?: string,"updated_at"?: string,"usage"?: NonNullable<Json>
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
                    "created_at": string,"display_name": string | null,"id": string,"owner_id": string,"revision": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name"?: string | null,"id"?: string,"owner_id": string,"revision"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string | null,"id"?: string,"owner_id"?: string,"revision"?: number,"updated_at"?: string
                  }
                  Relationships: [

                  ]
                },"artworks": {
                  Row: {
                    "active_publication_id": string | null,"create_fingerprint": string,"created_at": string,"creation_year": string | null,"deleted_at": string | null,"dimensions": string | null,"exhibition_id": string,"id": string,"image_material_id": string | null,"medium": string | null,"narration_draft": string | null,"number": number,"owner_id": string,"revision": number,"state": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active_publication_id"?: string | null,"create_fingerprint": string,"created_at"?: string,"creation_year"?: string | null,"deleted_at"?: string | null,"dimensions"?: string | null,"exhibition_id": string,"id": string,"image_material_id"?: string | null,"medium"?: string | null,"narration_draft"?: string | null,"number": number,"owner_id": string,"revision"?: number,"state"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "active_publication_id"?: string | null,"create_fingerprint"?: string,"created_at"?: string,"creation_year"?: string | null,"deleted_at"?: string | null,"dimensions"?: string | null,"exhibition_id"?: string,"id"?: string,"image_material_id"?: string | null,"medium"?: string | null,"narration_draft"?: string | null,"number"?: number,"owner_id"?: string,"revision"?: number,"state"?: string,"title"?: string,"updated_at"?: string
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
                    "approval_id": string,"artwork_id": string,"created_at": string,"exhibition_id": string,"id": string,"owner_id": string,"state": string,"storage_key": string | null,"text_hash": string,"voice_config_version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "approval_id": string,"artwork_id": string,"created_at"?: string,"exhibition_id": string,"id"?: string,"owner_id": string,"state"?: string,"storage_key"?: string | null,"text_hash": string,"voice_config_version": number
                  }
                  Update: {
                    "approval_id"?: string,"artwork_id"?: string,"created_at"?: string,"exhibition_id"?: string,"id"?: string,"owner_id"?: string,"state"?: string,"storage_key"?: string | null,"text_hash"?: string,"voice_config_version"?: number
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
                    "artist_id": string,"create_fingerprint": string,"created_at": string,"deleted_at": string | null,"end_date": string | null,"id": string,"intro_evidence": NonNullable<Json>,"owner_id": string,"place": string | null,"public_artist_bio": string | null,"public_artist_display_name": string | null,"public_end_date": string | null,"public_introduction": string | null,"public_place": string | null,"public_start_date": string | null,"public_theme": string | null,"public_title": string | null,"revision": number,"start_date": string | null,"state": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "artist_id": string,"create_fingerprint": string,"created_at"?: string,"deleted_at"?: string | null,"end_date"?: string | null,"id": string,"intro_evidence"?: NonNullable<Json>,"owner_id": string,"place"?: string | null,"public_artist_bio"?: string | null,"public_artist_display_name"?: string | null,"public_end_date"?: string | null,"public_introduction"?: string | null,"public_place"?: string | null,"public_start_date"?: string | null,"public_theme"?: string | null,"public_title"?: string | null,"revision"?: number,"start_date"?: string | null,"state"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "artist_id"?: string,"create_fingerprint"?: string,"created_at"?: string,"deleted_at"?: string | null,"end_date"?: string | null,"id"?: string,"intro_evidence"?: NonNullable<Json>,"owner_id"?: string,"place"?: string | null,"public_artist_bio"?: string | null,"public_artist_display_name"?: string | null,"public_end_date"?: string | null,"public_introduction"?: string | null,"public_place"?: string | null,"public_start_date"?: string | null,"public_theme"?: string | null,"public_title"?: string | null,"revision"?: number,"start_date"?: string | null,"state"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "exhibitions_owner_id_artist_id_fkey"
      columns: ["owner_id","artist_id"]
isOneToOne: false
      referencedRelation: "artist_profiles"
      referencedColumns: ["owner_id","id"]
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
                },"materials": {
                  Row: {
                    "artist_id": string | null,"artwork_id": string | null,"byte_size": number | null,"created_at": string,"exhibition_id": string | null,"id": string,"kind": string,"owner_id": string,"state": string,"storage_key": string | null,"text_body": string | null,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "artist_id"?: string | null,"artwork_id"?: string | null,"byte_size"?: number | null,"created_at"?: string,"exhibition_id"?: string | null,"id"?: string,"kind": string,"owner_id": string,"state"?: string,"storage_key"?: string | null,"text_body"?: string | null,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "artist_id"?: string | null,"artwork_id"?: string | null,"byte_size"?: number | null,"created_at"?: string,"exhibition_id"?: string | null,"id"?: string,"kind"?: string,"owner_id"?: string,"state"?: string,"storage_key"?: string | null,"text_body"?: string | null,"updated_at"?: string,"version"?: number
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
                    "approved_at": string,"approved_by": string,"artwork_id": string,"audio_key": string | null,"audio_text_hash": string | null,"creation_year": string | null,"dimensions": string | null,"evidence": NonNullable<Json>,"exhibition_id": string,"id": string,"image_key": string,"medium": string | null,"narration_citations": NonNullable<Json>,"narration_hash": string,"narration_text": string,"number": number,"owner_id": string,"revoked_at": string | null,"title": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string,"approved_by": string,"artwork_id": string,"audio_key"?: string | null,"audio_text_hash"?: string | null,"creation_year"?: string | null,"dimensions"?: string | null,"evidence": NonNullable<Json>,"exhibition_id": string,"id"?: string,"image_key": string,"medium"?: string | null,"narration_citations"?: NonNullable<Json>,"narration_hash": string,"narration_text": string,"number": number,"owner_id": string,"revoked_at"?: string | null,"title": string,"version": number
                  }
                  Update: {
                    "approved_at"?: string,"approved_by"?: string,"artwork_id"?: string,"audio_key"?: string | null,"audio_text_hash"?: string | null,"creation_year"?: string | null,"dimensions"?: string | null,"evidence"?: NonNullable<Json>,"exhibition_id"?: string,"id"?: string,"image_key"?: string,"medium"?: string | null,"narration_citations"?: NonNullable<Json>,"narration_hash"?: string,"narration_text"?: string,"number"?: number,"owner_id"?: string,"revoked_at"?: string | null,"title"?: string,"version"?: number
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
            "approve_evidence":
{ Args: { "p_evidence_id": string,"p_version": number }; Returns: Json
                           },
"approve_narration":
{ Args: { "p_artwork_id": string,"p_citations": Json,"p_expected_revision": number }; Returns: Json
                           },
"complete_ai_job":
{ Args: { "p_attempt": number,"p_job_id": string,"p_owner": string,"p_result": Json }; Returns: Json
                           },
"create_artwork":
{ Args: { "p_creation_year": string,"p_dimensions": string,"p_exhibition_id": string,"p_id": string,"p_medium": string,"p_number": number,"p_sections": Json,"p_source_refs": Json,"p_title": string }; Returns: Json
                           },
"create_exhibition":
{ Args: { "p_end_date": string,"p_id": string,"p_place": string,"p_sections": Json,"p_source_refs": Json,"p_start_date": string,"p_title": string }; Returns: Json
                           },
"get_ai_job":
{ Args: { "p_job_id": string }; Returns: Json
                           },
"get_artist_profile":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_artwork":
{ Args: { "p_id": string }; Returns: Json
                           },
"get_exhibition":
{ Args: { "p_id": string }; Returns: Json
                           },
"get_knowledge_document":
{ Args: { "p_subject_id": string,"p_subject_type": string }; Returns: Json
                           },
"get_narration_context":
{ Args: { "p_artwork_id": string }; Returns: Json
                           },
"get_public_artwork":
{ Args: { "p_exhibition_id": string,"p_id": string }; Returns: Json
                           },
"get_public_exhibition":
{ Args: { "p_id": string }; Returns: Json
                           },
"get_review_bundle":
{ Args: { "p_artwork_id": string }; Returns: Json
                           },
"get_revoke_impact":
{ Args: { "p_evidence_id": string,"p_expected_version": number }; Returns: Json
                           },
"is_publication_current":
{ Args: { "p_artwork_id": string,"p_exhibition_id": string,"p_publication_id": string,"p_version": number }; Returns: boolean
                           },
"list_artworks":
{ Args: { "p_exhibition_id": string }; Returns: Json
                           },
"list_exhibitions":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"list_labels":
{ Args: { "p_exhibition_id": string }; Returns: Json
                           },
"load_publication_context":
{ Args: { "p_artwork_id": string,"p_exhibition_id": string,"p_number": number }; Returns: Json
                           },
"pause":
{ Args: { "p_artwork_id"?: string,"p_exhibition_id": string,"p_expected_revision": number }; Returns: Json
                           },
"publish":
{ Args: { "p_artworks": Json,"p_exhibition_id": string,"p_expected_revision": number,"p_intro": Json,"p_owner": string,"p_request_id": string,"p_voice_required": boolean }; Returns: Json
                           },
"reserve_ai_job":
{ Args: { "p_artwork_id": string,"p_expected_document_revision": number,"p_expected_revision": number,"p_owner": string,"p_request_id": string,"p_strategy": string }; Returns: Json
                           } |
{ Args: { "p_artwork_id": string,"p_expected_document_revision": number,"p_expected_revision": number,"p_mock": boolean,"p_owner": string,"p_request_id": string,"p_strategy": string }; Returns: Json
                           },
"resume":
{ Args: { "p_artwork_id"?: string,"p_exhibition_id": string,"p_expected_revision": number,"p_owner": string,"p_voice_required": boolean }; Returns: Json
                           },
"retry_ai_job":
{ Args: { "p_expected_attempt": number,"p_job_id": string,"p_owner": string,"p_request_id": string }; Returns: Json
                           } |
{ Args: { "p_expected_attempt": number,"p_job_id": string,"p_mock": boolean,"p_owner": string,"p_request_id": string }; Returns: Json
                           },
"revoke_evidence":
{ Args: { "p_evidence_id": string,"p_expected_version": number,"p_impact_token": string }; Returns: Json
                           },
"save_narration_draft":
{ Args: { "p_artwork_id": string,"p_expected_revision": number,"p_source_job_id"?: string,"p_text": string }; Returns: Json
                           },
"update_artist_profile":
{ Args: { "p_display_name": string,"p_expected_document_revision": number,"p_expected_revision": number,"p_sections": Json,"p_source_refs": Json }; Returns: Json
                           },
"update_artwork":
{ Args: { "p_creation_year": string,"p_dimensions": string,"p_expected_document_revision": number,"p_expected_revision": number,"p_id": string,"p_medium": string,"p_number": number,"p_sections": Json,"p_source_refs": Json,"p_title": string }; Returns: Json
                           },
"update_exhibition":
{ Args: { "p_end_date": string,"p_expected_document_revision": number,"p_expected_revision": number,"p_id": string,"p_place": string,"p_sections": Json,"p_source_refs": Json,"p_start_date": string,"p_title": string }; Returns: Json
                           },
"update_knowledge_document":
{ Args: { "p_expected_revision": number,"p_sections": Json,"p_source_refs": Json,"p_subject_id": string,"p_subject_type": string }; Returns: Json
                           },
"upsert_evidence":
{ Args: { "p_artwork_id": string,"p_body": string,"p_evidence_id"?: string,"p_exhibition_id": string,"p_expected_version"?: number,"p_scope": string,"p_source": Json,"p_source_label": string }; Returns: Json
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
