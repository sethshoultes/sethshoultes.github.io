export interface Database {
  public: {
    Tables: {
      games: {
        Row: {
          id: string;
          name: string;
          slug: string;
          active: boolean;
          created_at: string;
          updated_at: string;
          last_accessed: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
          last_accessed?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
          last_accessed?: string | null;
        };
      };
      game_settings: {
        Row: {
          id: string;
          game_id: string;
          key: string;
          value: any;
          description: string | null;
          created_at: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          id?: string;
          game_id: string;
          key: string;
          value: any;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          id?: string;
          game_id?: string;
          key?: string;
          value?: any;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
          version?: number;
        };
      };
    };
  };
}