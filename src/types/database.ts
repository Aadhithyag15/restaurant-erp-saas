/**
 * Database types for the Phase 1 schema (supabase/migrations/0001_foundation.sql).
 * Hand-maintained until CI runs `supabase gen types typescript` — regenerate
 * after every migration and diff against this file.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type MemberRole = "owner" | "admin" | "manager" | "cashier" | "kitchen";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "expired";

// NOTE: must be a `type`, not an `interface` — interfaces lack the implicit
// index signature supabase-js's generics require (tables collapse to `never`).
export type Database = {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string;
          name: string;
          slug: string;
          currency: string;
          timezone: string;
          settings: Json;
          created_by: string | null;
          created_at: string;
        };
        Insert: Record<string, never>; // provisioning happens via create_tenant_with_trial RPC
        Update: {
          name?: string;
          currency?: string;
          timezone?: string;
          settings?: Json;
        };
        Relationships: [];
      };
      outlets: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          address: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          tenant_id: string;
          name?: string;
          address?: string | null;
          is_active?: boolean;
        };
        Update: {
          name?: string;
          address?: string | null;
          is_active?: boolean;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string;
          phone: string | null;
          created_at: string;
        };
        Insert: Record<string, never>; // created by auth trigger
        Update: {
          full_name?: string;
          phone?: string | null;
        };
        Relationships: [];
      };
      memberships: {
        Row: {
          id: string;
          tenant_id: string;
          user_id: string;
          role: MemberRole;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          tenant_id: string;
          user_id: string;
          role?: MemberRole;
          is_active?: boolean;
        };
        Update: {
          role?: MemberRole;
          is_active?: boolean;
        };
        Relationships: [];
      };
      invitations: {
        Row: {
          id: string;
          tenant_id: string;
          email: string;
          role: MemberRole;
          token: string;
          expires_at: string;
          accepted_at: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          tenant_id: string;
          email: string;
          role?: MemberRole;
          created_by?: string | null;
        };
        Update: {
          expires_at?: string;
        };
        Relationships: [];
      };
      plans: {
        Row: {
          id: string;
          code: string;
          name: string;
          price_monthly: number;
          limits: Json;
          is_active: boolean;
        };
        Insert: Record<string, never>; // service role only
        Update: Record<string, never>;
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          tenant_id: string;
          plan_id: string;
          status: SubscriptionStatus;
          trial_ends_at: string | null;
          current_period_end: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, never>; // service role / RPC only
        Update: Record<string, never>;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: number;
          tenant_id: string;
          user_id: string | null;
          action: string;
          entity: string | null;
          entity_id: string | null;
          old_value: Json | null;
          new_value: Json | null;
          created_at: string;
        };
        Insert: Record<string, never>; // definer functions only
        Update: Record<string, never>;
        Relationships: [];
      };
      menu_categories: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          sort_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          tenant_id: string;
          name: string;
          sort_order?: number;
          is_active?: boolean;
        };
        Update: {
          name?: string;
          sort_order?: number;
          is_active?: boolean;
        };
        Relationships: [];
      };
      menu_items: {
        Row: {
          id: string;
          tenant_id: string;
          category_id: string | null;
          name: string;
          sku: string | null;
          price: number;
          tax_rate: number;
          is_veg: boolean;
          is_available: boolean;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          tenant_id: string;
          category_id?: string | null;
          name: string;
          sku?: string | null;
          price: number;
          tax_rate?: number;
          is_veg?: boolean;
          is_available?: boolean;
          description?: string | null;
        };
        Update: {
          category_id?: string | null;
          name?: string;
          sku?: string | null;
          price?: number;
          tax_rate?: number;
          is_veg?: boolean;
          is_available?: boolean;
          description?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_tenant_with_trial: {
        Args: { p_name: string; p_slug: string };
        Returns: string;
      };
      accept_invitation: {
        Args: { p_token: string };
        Returns: string;
      };
      set_edit_code: {
        Args: { p_tenant: string; p_code: string };
        Returns: undefined;
      };
      verify_edit_code: {
        Args: { p_tenant: string; p_code: string };
        Returns: boolean;
      };
      is_member: {
        Args: { t: string };
        Returns: boolean;
      };
      tenant_is_active: {
        Args: { t: string };
        Returns: boolean;
      };
    };
    Enums: {
      member_role: MemberRole;
      subscription_status: SubscriptionStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
