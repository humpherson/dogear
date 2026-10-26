export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      books: {
        Row: {
          authors: string[];
          cover_url: string | null;
          created_at: string;
          description: string | null;
          id: string;
          isbn_10: string | null;
          isbn_13: string | null;
          published_date: string | null;
          source: string;
          source_id: string;
          title: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          authors?: string[];
          cover_url?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          isbn_10?: string | null;
          isbn_13?: string | null;
          published_date?: string | null;
          source: string;
          source_id: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          authors?: string[];
          cover_url?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          isbn_10?: string | null;
          isbn_13?: string | null;
          published_date?: string | null;
          source?: string;
          source_id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      collections: {
        Row: {
          background_colour: string;
          border_colour: string;
          created_at: string;
          icon: string;
          icon_colour: string;
          id: string;
          name: string;
          text_colour: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          background_colour?: string;
          border_colour?: string;
          created_at?: string;
          icon?: string;
          icon_colour?: string;
          id?: string;
          name: string;
          text_colour?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          background_colour?: string;
          border_colour?: string;
          created_at?: string;
          icon?: string;
          icon_colour?: string;
          id?: string;
          name?: string;
          text_colour?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          display_name?: string | null;
          id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      quotes: {
        Row: {
          collection_id: string | null;
          created_at: string;
          credit_author: string | null;
          credit_mode: string;
          credit_source: string | null;
          credit_year: string | null;
          id: string;
          item_type: string;
          lookup_attribution: Json | null;
          note: string | null;
          page_number: string | null;
          term: string | null;
          text: string;
          updated_at: string;
          user_book_id: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          collection_id?: string | null;
          created_at?: string;
          credit_author?: string | null;
          credit_mode?: string;
          credit_source?: string | null;
          credit_year?: string | null;
          id?: string;
          item_type?: string;
          lookup_attribution?: Json | null;
          note?: string | null;
          page_number?: string | null;
          term?: string | null;
          text: string;
          updated_at?: string;
          user_book_id?: string | null;
          user_id: string;
        };
        Update: {
          collection_id?: string | null;
          created_at?: string;
          credit_author?: string | null;
          credit_mode?: string;
          credit_source?: string | null;
          credit_year?: string | null;
          id?: string;
          item_type?: string;
          lookup_attribution?: Json | null;
          note?: string | null;
          page_number?: string | null;
          term?: string | null;
          text?: string;
          updated_at?: string;
          user_book_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'quotes_collection_owner';
            columns: ['collection_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'collections';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'quotes_user_book_id_user_id_fkey';
            columns: ['user_book_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'user_books';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      user_books: {
        Row: {
          book_id: string;
          created_at: string;
          id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          book_id: string;
          created_at?: string;
          id?: string;
          user_id: string;
        };
        Update: {
          book_id?: string;
          created_at?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_books_book_id_fkey';
            columns: ['book_id'];
            isOneToOne: false;
            referencedRelation: 'books';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      collection_quote_payload: { Args: { input: Json }; Returns: Json };
      delete_library_item: { Args: { item_id: string }; Returns: Json };
      delete_library_quote: {
        Args: { quote_id: string };
        Returns: {
          collection_id: string;
          remaining_count: number;
          user_book_id: string;
        }[];
      };
      delete_quote: { Args: { quote_id: string }; Returns: undefined };
      delete_quote_result: {
        Args: { quote_id: string };
        Returns: {
          remaining_count: number;
          user_book_id: string;
        }[];
      };
      edit_collection: {
        Args: {
          appearance?: Json;
          collection_id: string;
          collection_name: string;
        };
        Returns: Json;
      };
      edit_library_quote: {
        Args: { quote: Json; quote_id: string };
        Returns: Json;
      };
      get_library_entries: {
        Args: Record<PropertyKey, never>;
        Returns: Json[];
      };
      get_library_entry: {
        Args: { entry_id: string; entry_kind: string };
        Returns: Json;
      };
      get_random_library_entry_quote: {
        Args: { exclude_quote_id?: string };
        Returns: {
          author: string;
          book_title: string;
          entry_kind: string;
          entry_title: string;
          published_year: string;
          quote_id: string;
          text: string;
          user_book_id: string;
        }[];
      };
      get_random_library_item: {
        Args: { exclude_item_id?: string };
        Returns: Json;
      };
      get_random_library_quote: {
        Args: { exclude_quote_id?: string };
        Returns: {
          author: string;
          book_title: string;
          published_year: string;
          quote_id: string;
          text: string;
          user_book_id: string;
        }[];
      };
      library_entry_result: {
        Args: { entry_id: string; entry_kind: string; summary_only?: boolean };
        Returns: Json;
      };
      move_quote: {
        Args: {
          credits?: Json;
          new_collection_name?: string;
          quote_id: string;
          target_id?: string;
          target_kind: string;
        };
        Returns: Json;
      };
      move_quote_with_appearance: {
        Args: {
          appearance?: Json;
          credits?: Json;
          new_collection_name?: string;
          quote_id: string;
          target_id?: string;
          target_kind: string;
        };
        Returns: Json;
      };
      rename_collection: {
        Args: { collection_id: string; collection_name: string };
        Returns: Json;
      };
      save_collection_quote: {
        Args: { collection_id?: string; collection_name?: string; quote: Json };
        Returns: {
          library_entry: Json;
          quote_record: Json;
        }[];
      };
      save_quote_with_book: {
        Args: { book: Json; quote: Json };
        Returns: {
          quote_id: string;
          user_book_id: string;
        }[];
      };
      save_quote_with_book_result: {
        Args: { book: Json; quote: Json };
        Returns: {
          library_entry: Json;
          quote_record: Json;
        }[];
      };
      save_styled_collection_quote: {
        Args: {
          appearance?: Json;
          collection_id?: string;
          collection_name?: string;
          quote: Json;
        };
        Returns: {
          library_entry: Json;
          quote_record: Json;
        }[];
      };
      saved_item_payload: {
        Args: { input: Json; original?: Json };
        Returns: Json;
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
