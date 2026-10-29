
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "blocked_users": {
                  Row: {
                    "blocked_id": string,"blocker_id": string,"created_at": string,"reason": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "blocked_id": string,"blocker_id": string,"created_at"?: string,"reason"?: string | null
                  }
                  Update: {
                    "blocked_id"?: string,"blocker_id"?: string,"created_at"?: string,"reason"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "blocked_users_blocked_id_fkey"
      columns: ["blocked_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "blocked_users_blocked_id_fkey"
      columns: ["blocked_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "blocked_users_blocker_id_fkey"
      columns: ["blocker_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "blocked_users_blocker_id_fkey"
      columns: ["blocker_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "attribute_schema": NonNullable<Json>,"created_at": string,"icon": string | null,"id": number,"is_active": boolean,"name": string,"parent_id": number | null,"slug": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "attribute_schema"?: NonNullable<Json>,"created_at"?: string,"icon"?: string | null,"id"?: never,"is_active"?: boolean,"name": string,"parent_id"?: number | null,"slug": string,"sort_order"?: number
                  }
                  Update: {
                    "attribute_schema"?: NonNullable<Json>,"created_at"?: string,"icon"?: string | null,"id"?: never,"is_active"?: boolean,"name"?: string,"parent_id"?: number | null,"slug"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    }
                  ]
                },"conversation_participants": {
                  Row: {
                    "archived_at": string | null,"conversation_id": string,"last_read_at": string | null,"role": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"conversation_id": string,"last_read_at"?: string | null,"role": string,"user_id": string
                  }
                  Update: {
                    "archived_at"?: string | null,"conversation_id"?: string,"last_read_at"?: string | null,"role"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversation_participants_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversation_participants_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversation_participants_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"conversations": {
                  Row: {
                    "buyer_id": string,"created_at": string,"id": string,"last_message_at": string,"last_message_preview": string | null,"listing_id": string | null,"seller_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "buyer_id": string,"created_at"?: string,"id"?: string,"last_message_at"?: string,"last_message_preview"?: string | null,"listing_id"?: string | null,"seller_id": string
                  }
                  Update: {
                    "buyer_id"?: string,"created_at"?: string,"id"?: string,"last_message_at"?: string,"last_message_preview"?: string | null,"listing_id"?: string | null,"seller_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversations_buyer_id_fkey"
      columns: ["buyer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversations_buyer_id_fkey"
      columns: ["buyer_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversations_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listing_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversations_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversations_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conversations_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"countries": {
                  Row: {
                    "allow_cross_border_discovery": boolean,"code": string,"created_at": string,"currency_code": string,"currency_minor_units": number,"default_language": string,"free_active_listing_limit": number,"is_active": boolean,"listing_duration_days": number,"locale": string,"name": string,"payment_provider": string | null,"phone_pattern": string,"phone_prefix": string,"postal_code_label": string | null,"region_label": string,"sort_order": number,"supported_languages": (string)[],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allow_cross_border_discovery"?: boolean,"code": string,"created_at"?: string,"currency_code": string,"currency_minor_units"?: number,"default_language"?: string,"free_active_listing_limit"?: number,"is_active"?: boolean,"listing_duration_days"?: number,"locale": string,"name": string,"payment_provider"?: string | null,"phone_pattern": string,"phone_prefix": string,"postal_code_label"?: string | null,"region_label"?: string,"sort_order"?: number,"supported_languages"?: (string)[],"updated_at"?: string
                  }
                  Update: {
                    "allow_cross_border_discovery"?: boolean,"code"?: string,"created_at"?: string,"currency_code"?: string,"currency_minor_units"?: number,"default_language"?: string,"free_active_listing_limit"?: number,"is_active"?: boolean,"listing_duration_days"?: number,"locale"?: string,"name"?: string,"payment_provider"?: string | null,"phone_pattern"?: string,"phone_prefix"?: string,"postal_code_label"?: string | null,"region_label"?: string,"sort_order"?: number,"supported_languages"?: (string)[],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"country_policies": {
                  Row: {
                    "body": string,"country_code": string | null,"id": number,"kind": string,"title": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"country_code"?: string | null,"id"?: never,"kind": string,"title": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "body"?: string,"country_code"?: string | null,"id"?: never,"kind"?: string,"title"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "country_policies_country_code_fkey"
      columns: ["country_code"]
isOneToOne: false
      referencedRelation: "countries"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "country_policies_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "country_policies_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"favourites": {
                  Row: {
                    "created_at": string,"listing_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"listing_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"listing_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "favourites_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listing_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "favourites_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "favourites_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "favourites_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"listing_images": {
                  Row: {
                    "alt_text": string | null,"created_at": string,"height": number | null,"id": string,"listing_id": string,"position": number,"storage_path": string,"url": string,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "alt_text"?: string | null,"created_at"?: string,"height"?: number | null,"id"?: string,"listing_id": string,"position"?: number,"storage_path": string,"url": string,"width"?: number | null
                  }
                  Update: {
                    "alt_text"?: string | null,"created_at"?: string,"height"?: number | null,"id"?: string,"listing_id"?: string,"position"?: number,"storage_path"?: string,"url"?: string,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "listing_images_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listing_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listing_images_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    }
                  ]
                },"listing_view_events": {
                  Row: {
                    "day": string,"listing_id": string,"viewer_key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "day"?: string,"listing_id": string,"viewer_key": string
                  }
                  Update: {
                    "day"?: string,"listing_id"?: string,"viewer_key"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "listing_view_events_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listing_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listing_view_events_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    }
                  ]
                },"listings": {
                  Row: {
                    "attributes": NonNullable<Json>,"category_id": number,"city": string | null,"condition": Database["public"]['Enums']["item_condition"],"country_code": string,"created_at": string,"currency": string,"delivery_notes": string | null,"delivery_options": (Database["public"]['Enums']["delivery_option"])[],"description": string,"expires_at": string | null,"favourite_count": number,"id": string,"is_seed": boolean,"latitude": number | null,"longitude": number | null,"message_count": number,"moderation_note": string | null,"moderation_status": Database["public"]['Enums']["moderation_status"],"price_minor": number | null,"price_type": Database["public"]['Enums']["price_type"],"published_at": string | null,"quantity": number,"region_id": number | null,"search_vector": unknown,"seller_id": string,"sold_at": string | null,"sold_to": string | null,"status": Database["public"]['Enums']["listing_status"],"subcategory_id": number | null,"title": string,"updated_at": string,"view_count": number
                  }
                  ComputedFields: never
                  Insert: {
                    "attributes"?: NonNullable<Json>,"category_id": number,"city"?: string | null,"condition": Database["public"]['Enums']["item_condition"],"country_code": string,"created_at"?: string,"currency": string,"delivery_notes"?: string | null,"delivery_options"?: (Database["public"]['Enums']["delivery_option"])[],"description": string,"expires_at"?: string | null,"favourite_count"?: number,"id"?: string,"is_seed"?: boolean,"latitude"?: number | null,"longitude"?: number | null,"message_count"?: number,"moderation_note"?: string | null,"moderation_status"?: Database["public"]['Enums']["moderation_status"],"price_minor"?: number | null,"price_type"?: Database["public"]['Enums']["price_type"],"published_at"?: string | null,"quantity"?: number,"region_id"?: number | null,"search_vector"?: never,"seller_id": string,"sold_at"?: string | null,"sold_to"?: string | null,"status"?: Database["public"]['Enums']["listing_status"],"subcategory_id"?: number | null,"title": string,"updated_at"?: string,"view_count"?: number
                  }
                  Update: {
                    "attributes"?: NonNullable<Json>,"category_id"?: number,"city"?: string | null,"condition"?: Database["public"]['Enums']["item_condition"],"country_code"?: string,"created_at"?: string,"currency"?: string,"delivery_notes"?: string | null,"delivery_options"?: (Database["public"]['Enums']["delivery_option"])[],"description"?: string,"expires_at"?: string | null,"favourite_count"?: number,"id"?: string,"is_seed"?: boolean,"latitude"?: number | null,"longitude"?: number | null,"message_count"?: number,"moderation_note"?: string | null,"moderation_status"?: Database["public"]['Enums']["moderation_status"],"price_minor"?: number | null,"price_type"?: Database["public"]['Enums']["price_type"],"published_at"?: string | null,"quantity"?: number,"region_id"?: number | null,"search_vector"?: never,"seller_id"?: string,"sold_at"?: string | null,"sold_to"?: string | null,"status"?: Database["public"]['Enums']["listing_status"],"subcategory_id"?: number | null,"title"?: string,"updated_at"?: string,"view_count"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "listings_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_country_code_fkey"
      columns: ["country_code"]
isOneToOne: false
      referencedRelation: "countries"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "listings_region_id_fkey"
      columns: ["region_id"]
isOneToOne: false
      referencedRelation: "regions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_sold_to_fkey"
      columns: ["sold_to"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_sold_to_fkey"
      columns: ["sold_to"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_subcategory_id_fkey"
      columns: ["subcategory_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    }
                  ]
                },"messages": {
                  Row: {
                    "body": string,"conversation_id": string,"created_at": string,"has_link": boolean,"id": string,"kind": string,"offer_id": string | null,"sender_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"conversation_id": string,"created_at"?: string,"has_link"?: boolean,"id"?: string,"kind"?: string,"offer_id"?: string | null,"sender_id"?: string | null
                  }
                  Update: {
                    "body"?: string,"conversation_id"?: string,"created_at"?: string,"has_link"?: boolean,"id"?: string,"kind"?: string,"offer_id"?: string | null,"sender_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "offers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string | null,"created_at": string,"data": NonNullable<Json>,"id": string,"kind": string,"link": string | null,"read_at": string | null,"title": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: string,"kind": string,"link"?: string | null,"read_at"?: string | null,"title": string,"user_id": string
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: string,"kind"?: string,"link"?: string | null,"read_at"?: string | null,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"offers": {
                  Row: {
                    "amount_minor": number,"buyer_id": string,"conversation_id": string,"created_at": string,"currency": string,"expires_at": string,"id": string,"listing_id": string,"note": string | null,"parent_offer_id": string | null,"proposed_by": string,"quantity": number,"responded_at": string | null,"seller_id": string,"status": Database["public"]['Enums']["offer_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor": number,"buyer_id": string,"conversation_id": string,"created_at"?: string,"currency": string,"expires_at"?: string,"id"?: string,"listing_id": string,"note"?: string | null,"parent_offer_id"?: string | null,"proposed_by": string,"quantity"?: number,"responded_at"?: string | null,"seller_id": string,"status"?: Database["public"]['Enums']["offer_status"]
                  }
                  Update: {
                    "amount_minor"?: number,"buyer_id"?: string,"conversation_id"?: string,"created_at"?: string,"currency"?: string,"expires_at"?: string,"id"?: string,"listing_id"?: string,"note"?: string | null,"parent_offer_id"?: string | null,"proposed_by"?: string,"quantity"?: number,"responded_at"?: string | null,"seller_id"?: string,"status"?: Database["public"]['Enums']["offer_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "offers_buyer_id_fkey"
      columns: ["buyer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offers_buyer_id_fkey"
      columns: ["buyer_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offers_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offers_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listing_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offers_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offers_parent_offer_id_fkey"
      columns: ["parent_offer_id"]
isOneToOne: false
      referencedRelation: "offers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offers_proposed_by_fkey"
      columns: ["proposed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offers_proposed_by_fkey"
      columns: ["proposed_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offers_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offers_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"platform_settings": {
                  Row: {
                    "key": string,"updated_at": string,"updated_by": string | null,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"updated_at"?: string,"updated_by"?: string | null,"value": NonNullable<Json>
                  }
                  Update: {
                    "key"?: string,"updated_at"?: string,"updated_by"?: string | null,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "platform_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "platform_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"bio": string | null,"city": string | null,"country_code": string | null,"created_at": string,"deactivated_at": string | null,"deletion_requested_at": string | null,"display_name": string,"id": string,"is_seed": boolean,"marketing_consent_at": string | null,"notification_prefs": NonNullable<Json>,"phone": string | null,"phone_verified_at": string | null,"preferred_language": string,"region_id": number | null,"status": Database["public"]['Enums']["account_status"],"suspended_reason": string | null,"suspended_until": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"bio"?: string | null,"city"?: string | null,"country_code"?: string | null,"created_at"?: string,"deactivated_at"?: string | null,"deletion_requested_at"?: string | null,"display_name": string,"id": string,"is_seed"?: boolean,"marketing_consent_at"?: string | null,"notification_prefs"?: NonNullable<Json>,"phone"?: string | null,"phone_verified_at"?: string | null,"preferred_language"?: string,"region_id"?: number | null,"status"?: Database["public"]['Enums']["account_status"],"suspended_reason"?: string | null,"suspended_until"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "avatar_url"?: string | null,"bio"?: string | null,"city"?: string | null,"country_code"?: string | null,"created_at"?: string,"deactivated_at"?: string | null,"deletion_requested_at"?: string | null,"display_name"?: string,"id"?: string,"is_seed"?: boolean,"marketing_consent_at"?: string | null,"notification_prefs"?: NonNullable<Json>,"phone"?: string | null,"phone_verified_at"?: string | null,"preferred_language"?: string,"region_id"?: number | null,"status"?: Database["public"]['Enums']["account_status"],"suspended_reason"?: string | null,"suspended_until"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_country_code_fkey"
      columns: ["country_code"]
isOneToOne: false
      referencedRelation: "countries"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "profiles_region_id_fkey"
      columns: ["region_id"]
isOneToOne: false
      referencedRelation: "regions"
      referencedColumns: ["id"]
    }
                  ]
                },"prohibited_terms": {
                  Row: {
                    "action": string,"country_code": string | null,"created_at": string,"created_by": string | null,"id": number,"reason": string | null,"term": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action"?: string,"country_code"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: never,"reason"?: string | null,"term": string
                  }
                  Update: {
                    "action"?: string,"country_code"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: never,"reason"?: string | null,"term"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "prohibited_terms_country_code_fkey"
      columns: ["country_code"]
isOneToOne: false
      referencedRelation: "countries"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "prohibited_terms_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "prohibited_terms_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"regions": {
                  Row: {
                    "country_code": string,"id": number,"is_active": boolean,"kind": string,"latitude": number | null,"longitude": number | null,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "country_code": string,"id"?: never,"is_active"?: boolean,"kind"?: string,"latitude"?: number | null,"longitude"?: number | null,"name": string
                  }
                  Update: {
                    "country_code"?: string,"id"?: never,"is_active"?: boolean,"kind"?: string,"latitude"?: number | null,"longitude"?: number | null,"name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "regions_country_code_fkey"
      columns: ["country_code"]
isOneToOne: false
      referencedRelation: "countries"
      referencedColumns: ["code"]
    }
                  ]
                },"reports": {
                  Row: {
                    "country_code": string | null,"created_at": string,"details": string | null,"handled_by": string | null,"id": string,"listing_id": string | null,"message_id": string | null,"reason": Database["public"]['Enums']["report_reason"],"reported_user_id": string | null,"reporter_id": string | null,"resolution_note": string | null,"resolved_at": string | null,"review_id": string | null,"status": Database["public"]['Enums']["report_status"],"target_type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "country_code"?: string | null,"created_at"?: string,"details"?: string | null,"handled_by"?: string | null,"id"?: string,"listing_id"?: string | null,"message_id"?: string | null,"reason": Database["public"]['Enums']["report_reason"],"reported_user_id"?: string | null,"reporter_id"?: string | null,"resolution_note"?: string | null,"resolved_at"?: string | null,"review_id"?: string | null,"status"?: Database["public"]['Enums']["report_status"],"target_type": string
                  }
                  Update: {
                    "country_code"?: string | null,"created_at"?: string,"details"?: string | null,"handled_by"?: string | null,"id"?: string,"listing_id"?: string | null,"message_id"?: string | null,"reason"?: Database["public"]['Enums']["report_reason"],"reported_user_id"?: string | null,"reporter_id"?: string | null,"resolution_note"?: string | null,"resolved_at"?: string | null,"review_id"?: string | null,"status"?: Database["public"]['Enums']["report_status"],"target_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reports_country_code_fkey"
      columns: ["country_code"]
isOneToOne: false
      referencedRelation: "countries"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "reports_handled_by_fkey"
      columns: ["handled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_handled_by_fkey"
      columns: ["handled_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listing_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_message_id_fkey"
      columns: ["message_id"]
isOneToOne: false
      referencedRelation: "messages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_reported_user_id_fkey"
      columns: ["reported_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_reported_user_id_fkey"
      columns: ["reported_user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_reporter_id_fkey"
      columns: ["reporter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_reporter_id_fkey"
      columns: ["reporter_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_review_id_fkey"
      columns: ["review_id"]
isOneToOne: false
      referencedRelation: "reviews"
      referencedColumns: ["id"]
    }
                  ]
                },"reviews": {
                  Row: {
                    "body": string | null,"created_at": string,"id": string,"listing_id": string | null,"rating": number,"reviewer_id": string,"seller_id": string,"seller_reply": string | null,"status": string,"verified_transaction": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"id"?: string,"listing_id"?: string | null,"rating": number,"reviewer_id": string,"seller_id": string,"seller_reply"?: string | null,"status"?: string,"verified_transaction"?: boolean
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"id"?: string,"listing_id"?: string | null,"rating"?: number,"reviewer_id"?: string,"seller_id"?: string,"seller_reply"?: string | null,"status"?: string,"verified_transaction"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "reviews_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listing_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_reviewer_id_fkey"
      columns: ["reviewer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_reviewer_id_fkey"
      columns: ["reviewer_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"seller_follows": {
                  Row: {
                    "created_at": string,"follower_id": string,"seller_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"follower_id": string,"seller_id": string
                  }
                  Update: {
                    "created_at"?: string,"follower_id"?: string,"seller_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "seller_follows_follower_id_fkey"
      columns: ["follower_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "seller_follows_follower_id_fkey"
      columns: ["follower_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "seller_follows_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "seller_profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"seller_profiles": {
                  Row: {
                    "banner_url": string | null,"business_hours": Json | null,"business_name": string | null,"business_registration_number": string | null,"city": string | null,"contact_email": string | null,"contact_phone": string | null,"country_code": string,"created_at": string,"delivery_notes": string | null,"delivery_options": (Database["public"]['Enums']["delivery_option"])[],"description": string | null,"is_featured": boolean,"is_seed": boolean,"logo_url": string | null,"region_id": number | null,"seller_type": Database["public"]['Enums']["seller_type"],"shop_name": string,"show_whatsapp": boolean,"slug": string,"updated_at": string,"user_id": string,"verification_status": Database["public"]['Enums']["verification_status"],"verified_at": string | null,"whatsapp_number": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "banner_url"?: string | null,"business_hours"?: Json | null,"business_name"?: string | null,"business_registration_number"?: string | null,"city"?: string | null,"contact_email"?: string | null,"contact_phone"?: string | null,"country_code": string,"created_at"?: string,"delivery_notes"?: string | null,"delivery_options"?: (Database["public"]['Enums']["delivery_option"])[],"description"?: string | null,"is_featured"?: boolean,"is_seed"?: boolean,"logo_url"?: string | null,"region_id"?: number | null,"seller_type"?: Database["public"]['Enums']["seller_type"],"shop_name": string,"show_whatsapp"?: boolean,"slug": string,"updated_at"?: string,"user_id": string,"verification_status"?: Database["public"]['Enums']["verification_status"],"verified_at"?: string | null,"whatsapp_number"?: string | null
                  }
                  Update: {
                    "banner_url"?: string | null,"business_hours"?: Json | null,"business_name"?: string | null,"business_registration_number"?: string | null,"city"?: string | null,"contact_email"?: string | null,"contact_phone"?: string | null,"country_code"?: string,"created_at"?: string,"delivery_notes"?: string | null,"delivery_options"?: (Database["public"]['Enums']["delivery_option"])[],"description"?: string | null,"is_featured"?: boolean,"is_seed"?: boolean,"logo_url"?: string | null,"region_id"?: number | null,"seller_type"?: Database["public"]['Enums']["seller_type"],"shop_name"?: string,"show_whatsapp"?: boolean,"slug"?: string,"updated_at"?: string,"user_id"?: string,"verification_status"?: Database["public"]['Enums']["verification_status"],"verified_at"?: string | null,"whatsapp_number"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "seller_profiles_country_code_fkey"
      columns: ["country_code"]
isOneToOne: false
      referencedRelation: "countries"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "seller_profiles_region_id_fkey"
      columns: ["region_id"]
isOneToOne: false
      referencedRelation: "regions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "seller_profiles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "seller_profiles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"user_roles": {
                  Row: {
                    "granted_at": string,"granted_by": string | null,"role": Database["public"]['Enums']["app_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "granted_at"?: string,"granted_by"?: string | null,"role": Database["public"]['Enums']["app_role"],"user_id": string
                  }
                  Update: {
                    "granted_at"?: string,"granted_by"?: string | null,"role"?: Database["public"]['Enums']["app_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_roles_granted_by_fkey"
      columns: ["granted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_roles_granted_by_fkey"
      columns: ["granted_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_roles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_roles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "listing_cards": {
                  Row: {
                    "category_id": number,"category_slug": string,"city": string | null,"condition": Database["public"]['Enums']["item_condition"],"country_code": string,"created_at": string,"currency": string,"favourite_count": number,"id": string,"image_url": string | null,"is_seed": boolean,"latitude": number | null,"longitude": number | null,"moderation_status": Database["public"]['Enums']["moderation_status"],"price_minor": number | null,"price_type": Database["public"]['Enums']["price_type"],"published_at": string | null,"quantity": number,"region_id": number | null,"region_name": string | null,"seller_id": string,"seller_verification": Database["public"]['Enums']["verification_status"] | null,"shop_name": string | null,"shop_slug": string | null,"status": Database["public"]['Enums']["listing_status"],"title": string,"view_count": number
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "listings_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_country_code_fkey"
      columns: ["country_code"]
isOneToOne: false
      referencedRelation: "countries"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "listings_region_id_fkey"
      columns: ["region_id"]
isOneToOne: false
      referencedRelation: "regions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"public_profiles": {
                  Row: {
                    "avatar_url": string | null,"bio": string | null,"city": string | null,"country_code": string | null,"created_at": string,"display_name": string,"id": string,"status": Database["public"]['Enums']["account_status"]
                  }
                  ComputedFields: never
                  Insert: {
                           "avatar_url"?: string | null,"bio"?: string | null,"city"?: string | null,"country_code"?: string | null,"created_at"?: string | null,"display_name"?: string | null,"id"?: string | null,"status"?: Database["public"]['Enums']["account_status"] | null
                         }
                        Update: {
                           "avatar_url"?: string | null,"bio"?: string | null,"city"?: string | null,"country_code"?: string | null,"created_at"?: string | null,"display_name"?: string | null,"id"?: string | null,"status"?: Database["public"]['Enums']["account_status"] | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "profiles_country_code_fkey"
      columns: ["country_code"]
isOneToOne: false
      referencedRelation: "countries"
      referencedColumns: ["code"]
    }
                  ]
                },"seller_ratings": {
                  Row: {
                    "avg_rating": number | null,"review_count": number | null,"seller_id": string,"verified_count": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "reviews_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "_assert_can_interact":
{ Args: { "p_other": string,"p_user": string }; Returns: undefined
                           },
"_expire_if_due":
{ Args: { "p_offer": string }; Returns: boolean
                           },
"_post_message":
{ Args: { "p_body": string,"p_conversation": string,"p_kind": string,"p_offer"?: string,"p_sender": string }; Returns: string
                           },
"active_listing_limit":
{ Args: { "p_country": string,"p_user": string }; Returns: number
                           },
"assert_rate":
{ Args: { "p_count": number,"p_limit": number,"p_what": string }; Returns: undefined
                           },
"expire_listings":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"expire_offers":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"has_role":
{ Args: { "p_role": Database["public"]['Enums']["app_role"],"p_user"?: string }; Returns: boolean
                           },
"is_active_user":
{ Args: { "p_user"?: string }; Returns: boolean
                           },
"is_admin":
{ Args: { "p_user"?: string }; Returns: boolean
                           },
"is_blocked_between":
{ Args: { "a": string,"b": string }; Returns: boolean
                           },
"is_participant":
{ Args: { "p_conversation": string,"p_user"?: string }; Returns: boolean
                           },
"is_service":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_staff":
{ Args: { "p_user"?: string }; Returns: boolean
                           },
"make_offer":
{ Args: { "p_amount_minor": number,"p_listing": string,"p_note"?: string,"p_quantity"?: number }; Returns: string
                           },
"mark_conversation_read":
{ Args: { "p_conversation": string }; Returns: undefined
                           },
"mark_listing_sold":
{ Args: { "p_buyer"?: string,"p_listing": string }; Returns: undefined
                           },
"match_prohibited_term":
{ Args: { "p_country": string,"p_text": string }; Returns: {
              "action": string,"term": string
            }[]
                           },
"notify":
{ Args: { "p_body": string,"p_data"?: Json,"p_kind": string,"p_link": string,"p_title": string,"p_user": string }; Returns: undefined
                           },
"record_listing_view":
{ Args: { "p_listing": string,"p_viewer_key": string }; Returns: undefined
                           },
"renew_listing":
{ Args: { "p_listing": string }; Returns: undefined
                           },
"respond_offer":
{ Args: { "p_action": string,"p_counter_amount_minor"?: number,"p_note"?: string,"p_offer": string }; Returns: string
                           },
"review_eligibility":
{ Args: { "p_listing": string,"p_user"?: string }; Returns: string
                           },
"search_listings":
{ Args: { "p_category"?: string,"p_city"?: string,"p_conditions"?: (Database["public"]['Enums']["item_condition"])[],"p_country"?: string,"p_include_unavailable"?: boolean,"p_limit"?: number,"p_max_km"?: number,"p_max_price"?: number,"p_min_price"?: number,"p_near_lat"?: number,"p_near_lng"?: number,"p_negotiable_only"?: boolean,"p_offset"?: number,"p_query"?: string,"p_region_id"?: number,"p_seller_id"?: string,"p_sort"?: string }; Returns: {
              "category_id": number,
"category_slug": string,
"city": string | null,
"condition": Database["public"]['Enums']["item_condition"],
"country_code": string,
"created_at": string,
"currency": string,
"favourite_count": number,
"id": string,
"image_url": string | null,
"is_seed": boolean,
"latitude": number | null,
"longitude": number | null,
"moderation_status": Database["public"]['Enums']["moderation_status"],
"price_minor": number | null,
"price_type": Database["public"]['Enums']["price_type"],
"published_at": string | null,
"quantity": number,
"region_id": number | null,
"region_name": string | null,
"seller_id": string,
"seller_verification": Database["public"]['Enums']["verification_status"] | null,
"shop_name": string | null,
"shop_slug": string | null,
"status": Database["public"]['Enums']["listing_status"],
"title": string,
"view_count": number
            }[]
                          SetofOptions: {
        from: "*"
        to: "listing_cards"
        isOneToOne: false
        isSetofReturn: true
      } },
"send_message":
{ Args: { "p_body": string,"p_conversation": string }; Returns: string
                           },
"start_conversation":
{ Args: { "p_body": string,"p_listing": string }; Returns: string
                           },
"submit_review":
{ Args: { "p_body": string,"p_listing": string,"p_rating": number }; Returns: string
                           },
"unread_message_count":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"withdraw_offer":
{ Args: { "p_offer": string }; Returns: undefined
                           }
          }
          Enums: {
            "account_status": "active"|"suspended"|"deactivated"|"deleted","app_role": "admin"|"moderator","delivery_option": "local_pickup"|"buyer_collection"|"seller_dispatch"|"courier"|"other","item_condition": "new"|"like_new"|"used_good"|"used_fair"|"for_parts","listing_status": "draft"|"active"|"paused"|"reserved"|"sold"|"archived"|"expired","moderation_status": "approved"|"pending_review"|"rejected"|"removed","offer_status": "pending"|"accepted"|"rejected"|"countered"|"withdrawn"|"expired","price_type": "fixed"|"negotiable"|"contact","report_reason": "prohibited_item"|"scam_or_fraud"|"counterfeit"|"misleading"|"offensive"|"harassment"|"spam"|"wrong_category"|"other","report_status": "open"|"reviewing"|"resolved"|"dismissed","seller_type": "individual"|"trader"|"shop"|"wholesaler"|"business","verification_status": "unverified"|"pending"|"verified"|"rejected"
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
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "account_status": ["active", "suspended", "deactivated", "deleted"],"app_role": ["admin", "moderator"],"delivery_option": ["local_pickup", "buyer_collection", "seller_dispatch", "courier", "other"],"item_condition": ["new", "like_new", "used_good", "used_fair", "for_parts"],"listing_status": ["draft", "active", "paused", "reserved", "sold", "archived", "expired"],"moderation_status": ["approved", "pending_review", "rejected", "removed"],"offer_status": ["pending", "accepted", "rejected", "countered", "withdrawn", "expired"],"price_type": ["fixed", "negotiable", "contact"],"report_reason": ["prohibited_item", "scam_or_fraud", "counterfeit", "misleading", "offensive", "harassment", "spam", "wrong_category", "other"],"report_status": ["open", "reviewing", "resolved", "dismissed"],"seller_type": ["individual", "trader", "shop", "wholesaler", "business"],"verification_status": ["unverified", "pending", "verified", "rejected"]
          }
        }
} as const
