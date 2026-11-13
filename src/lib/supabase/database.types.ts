
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {

  "public": {
          Tables: {
            "api_requests": {
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
                },"exhibitions": {
                  Row: {
                    "artist_id": string,"create_fingerprint": string,"created_at": string,"deleted_at": string | null,"end_date": string | null,"id": string,"owner_id": string,"place": string | null,"public_artist_bio": string | null,"public_artist_display_name": string | null,"public_end_date": string | null,"public_introduction": string | null,"public_place": string | null,"public_start_date": string | null,"public_theme": string | null,"public_title": string | null,"revision": number,"start_date": string | null,"state": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "artist_id": string,"create_fingerprint": string,"created_at"?: string,"deleted_at"?: string | null,"end_date"?: string | null,"id": string,"owner_id": string,"place"?: string | null,"public_artist_bio"?: string | null,"public_artist_display_name"?: string | null,"public_end_date"?: string | null,"public_introduction"?: string | null,"public_place"?: string | null,"public_start_date"?: string | null,"public_theme"?: string | null,"public_title"?: string | null,"revision"?: number,"start_date"?: string | null,"state"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "artist_id"?: string,"create_fingerprint"?: string,"created_at"?: string,"deleted_at"?: string | null,"end_date"?: string | null,"id"?: string,"owner_id"?: string,"place"?: string | null,"public_artist_bio"?: string | null,"public_artist_display_name"?: string | null,"public_end_date"?: string | null,"public_introduction"?: string | null,"public_place"?: string | null,"public_start_date"?: string | null,"public_theme"?: string | null,"public_title"?: string | null,"revision"?: number,"start_date"?: string | null,"state"?: string,"title"?: string,"updated_at"?: string
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
                },"publications": {
                  Row: {
                    "approved_at": string,"approved_by": string,"artwork_id": string,"audio_key": string,"audio_text_hash": string,"creation_year": string | null,"dimensions": string | null,"evidence": NonNullable<Json>,"exhibition_id": string,"id": string,"image_key": string,"medium": string | null,"narration_hash": string,"narration_text": string,"number": number,"owner_id": string,"revoked_at": string | null,"title": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string,"approved_by": string,"artwork_id": string,"audio_key": string,"audio_text_hash": string,"creation_year"?: string | null,"dimensions"?: string | null,"evidence": NonNullable<Json>,"exhibition_id": string,"id"?: string,"image_key": string,"medium"?: string | null,"narration_hash": string,"narration_text": string,"number": number,"owner_id": string,"revoked_at"?: string | null,"title": string,"version": number
                  }
                  Update: {
                    "approved_at"?: string,"approved_by"?: string,"artwork_id"?: string,"audio_key"?: string,"audio_text_hash"?: string,"creation_year"?: string | null,"dimensions"?: string | null,"evidence"?: NonNullable<Json>,"exhibition_id"?: string,"id"?: string,"image_key"?: string,"medium"?: string | null,"narration_hash"?: string,"narration_text"?: string,"number"?: number,"owner_id"?: string,"revoked_at"?: string | null,"title"?: string,"version"?: number
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
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "create_artwork":
{ Args: { "p_creation_year": string,"p_dimensions": string,"p_exhibition_id": string,"p_id": string,"p_medium": string,"p_number": number,"p_sections": Json,"p_source_refs": Json,"p_title": string }; Returns: Json
                           },
"create_exhibition":
{ Args: { "p_end_date": string,"p_id": string,"p_place": string,"p_sections": Json,"p_source_refs": Json,"p_start_date": string,"p_title": string }; Returns: Json
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
"get_public_artwork":
{ Args: { "p_exhibition_id": string,"p_id": string }; Returns: Json
                           },
"get_public_exhibition":
{ Args: { "p_id": string }; Returns: Json
                           },
"list_artworks":
{ Args: { "p_exhibition_id": string }; Returns: Json
                           },
"list_exhibitions":
{ Args: Record<PropertyKey, never>; Returns: Json
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
