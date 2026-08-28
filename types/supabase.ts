export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17";
  };
  public: {
    Tables: {
      chat_interactions: {
        Row: {
          created_at: string;
          id: string;
          request_metadata: Json | null;
          response_metadata: Json | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          request_metadata?: Json | null;
          response_metadata?: Json | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          request_metadata?: Json | null;
          response_metadata?: Json | null;
          user_id?: string;
        };
        Relationships: [];
      };
      chess_claim_attempts: {
        Row: {
          created_at: string;
          id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      contact_messages: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          ip_hash: string;
          message: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
          ip_hash: string;
          message: string;
          name: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          ip_hash?: string;
          message?: string;
          name?: string;
        };
        Relationships: [];
      };
      jtb_chunks: {
        Row: {
          chunk_index: number;
          content: string;
          content_hash: string;
          created_at: string;
          embedding: string;
          embedding_model: string;
          section: string;
          updated_at: string;
        };
        Insert: {
          chunk_index: number;
          content: string;
          content_hash: string;
          created_at?: string;
          embedding: string;
          embedding_model: string;
          section: string;
          updated_at?: string;
        };
        Update: {
          chunk_index?: number;
          content?: string;
          content_hash?: string;
          created_at?: string;
          embedding?: string;
          embedding_model?: string;
          section?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          chess_reward_claimed: boolean;
          created_at: string;
          credits_remaining: number;
          employment_status: string | null;
          id: string;
          updated_at: string;
        };
        Insert: {
          chess_reward_claimed?: boolean;
          created_at?: string;
          credits_remaining?: number;
          employment_status?: string | null;
          id: string;
          updated_at?: string;
        };
        Update: {
          chess_reward_claimed?: boolean;
          created_at?: string;
          credits_remaining?: number;
          employment_status?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      rewards: {
        Row: {
          created_at: string;
          credits_awarded: number;
          id: string;
          metadata: Json | null;
          reward_type: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          credits_awarded: number;
          id?: string;
          metadata?: Json | null;
          reward_type: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          credits_awarded?: number;
          id?: string;
          metadata?: Json | null;
          reward_type?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      claim_chess_reward: {
        Args: { p_metadata?: Json; p_user_id: string };
        Returns: Json;
      };
      count_recent_contact_messages: {
        Args: { p_ip_hash: string; p_since: string };
        Returns: number;
      };
      deduct_credit: { Args: { p_user_id: string }; Returns: number };
      match_jtb_chunks: {
        Args: { p_match_count?: number; p_query_embedding: string };
        Returns: {
          chunk_index: number;
          content: string;
          embedding_model: string;
          section: string;
          similarity: number;
        }[];
      };
      record_chat_interaction: {
        Args: {
          p_request_metadata: Json;
          p_response_metadata: Json;
          p_user_id: string;
        };
        Returns: undefined;
      };
      record_contact_message: {
        Args: {
          p_email: string;
          p_ip_hash: string;
          p_message: string;
          p_name: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
