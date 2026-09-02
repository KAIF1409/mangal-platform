// Hand-maintained database types for the WebMangal Books module:
// public.books, public.book_purchases, public.book_reading_progress.
//
// Source of truth (DDL):
//   supabase/migrations/20260822000000_books_module.sql
//   supabase/migrations/20260825000000_books_schema_cache_hotfix.sql
// If those migrations change, mirror the change here.
//
// Why scoped/hand-written instead of `supabase gen types` everywhere: the
// generated Database covers every table in the project, and wiring it into the
// shared browser client (src/app/lib/supabase.ts) would couple ~60 unrelated
// call-sites (series/chapters/videos/kcircle…) to a full regeneration cycle.
// These types give every books surface one strict, shared definition instead
// of the per-file `interface BookRow` copies this module used to accumulate.
// Clients stay untyped and cast query results to the row types below.
//
// The object shape follows @supabase/supabase-js v2's GenericSchema contract,
// so a client can opt in later with createClient<Database>(…) once full-table
// coverage lands. bigint/int/numeric map to number, timestamptz to ISO string.

export type BookFileType = 'pdf' | 'epub';
export type BookPricingType = 'FREE' | 'PAID';
export type BookStatus = 'draft' | 'published';

export interface Database {
  public: {
    Tables: {
      books: {
        Row: {
          id: string;
          author_id: string;
          title: string;
          description: string | null;
          cover_image_url: string | null;
          file_url: string;
          file_type: BookFileType;
          file_size_bytes: number | null;
          pricing_type: BookPricingType;
          price_paise: number | null;
          category: string | null;
          // §142 metadata-manager columns (20260902090000_books_metadata.sql).
          // Hand-mirrored here per this file's header rule. Clients reading a
          // pre-migration DB see these as undefined at runtime — every reader
          // goes through the optional-field helpers in lib/booksMetadata.ts.
          genre_tags: string[];
          is_mature: boolean;
          publish_at: string | null;
          status: BookStatus;
          views: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          title: string;
          description?: string | null;
          cover_image_url?: string | null;
          file_url: string;
          file_type: BookFileType;
          file_size_bytes?: number | null;
          pricing_type?: BookPricingType;
          price_paise?: number | null;
          category?: string | null;
          genre_tags?: string[] | null;
          is_mature?: boolean | null;
          publish_at?: string | null;
          status?: BookStatus;
          views?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          author_id?: string;
          title?: string;
          description?: string | null;
          cover_image_url?: string | null;
          file_url?: string;
          file_type?: BookFileType;
          file_size_bytes?: number | null;
          pricing_type?: BookPricingType;
          price_paise?: number | null;
          category?: string | null;
          genre_tags?: string[] | null;
          is_mature?: boolean | null;
          publish_at?: string | null;
          status?: BookStatus;
          views?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      book_purchases: {
        Row: {
          id: string;
          book_id: string;
          user_id: string;
          payment_id: string | null;
          amount_paid_paise: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          book_id: string;
          user_id: string;
          payment_id?: string | null;
          amount_paid_paise: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          book_id?: string;
          user_id?: string;
          payment_id?: string | null;
          amount_paid_paise?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      book_reading_progress: {
        Row: {
          id: string;
          book_id: string;
          user_id: string;
          last_page: number;
          total_pages: number | null;
          percent: number | null;
          last_location: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          book_id: string;
          user_id: string;
          last_page?: number;
          total_pages?: number | null;
          percent?: number | null;
          last_location?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          book_id?: string;
          user_id?: string;
          last_page?: number;
          total_pages?: number | null;
          percent?: number | null;
          last_location?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

// ── Convenience aliases ───────────────────────────────────────────────────────
export type BooksTable = Database['public']['Tables']['books'];
/** Full row shape of public.books — mirrors the DB column-for-column. */
export type BookRow = BooksTable['Row'];
/** Payload accepted by `.from('books').insert(...)` (defaults filled server-side). */
export type BookInsert = BooksTable['Insert'];
/** Partial payload accepted by `.from('books').update(...)`. */
export type BookUpdate = BooksTable['Update'];
export type BookPurchaseRow = Database['public']['Tables']['book_purchases']['Row'];
export type BookReadingProgressRow = Database['public']['Tables']['book_reading_progress']['Row'];

// Client annotated with these types once full-table coverage lands:
// import type { SupabaseClient } from '@supabase/supabase-js';
// export type TypedSupabaseClient = SupabaseClient<Database>;