export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type ProfileRole = 'super_admin' | 'admin' | 'user';
export type TournamentStatus = 'draft' | 'active' | 'archived';
export type SeasonStatus = 'draft' | 'active' | 'completed' | 'archived';
export type MatchPhase = 'regular_season' | 'playoff' | 'playout';
export type MatchStatus = 'scheduled' | 'played' | 'postponed' | 'cancelled';
export type ResultStatus = 'pending' | 'official';

type TableDefinition<Row, Insert = Row, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: never[];
};

type TimestampFields = {
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: TableDefinition<
        TimestampFields & {
          id: string;
          auth_user_id: string;
          role: ProfileRole;
          full_name: string;
          email: string | null;
          avatar_url: string | null;
        }
      >;
      notifications: TableDefinition<{
        id: string;
        profile_id: string;
        title: string;
        body: string;
        is_read: boolean;
        created_at: string;
        read_at: string | null;
      }>;
      tournaments: TableDefinition<
        TimestampFields & {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          status: TournamentStatus;
          is_public: boolean;
          created_by: string | null;
        }
      >;
      seasons: TableDefinition<
        TimestampFields & {
          id: string;
          tournament_id: string;
          name: string;
          slug: string;
          status: SeasonStatus;
          starts_on: string | null;
          ends_on: string | null;
          is_public: boolean;
        }
      >;
      season_settings: TableDefinition<
        TimestampFields & {
          id: string;
          season_id: string;
          regular_season_label: string;
          playoffs_enabled: boolean;
          playoff_teams_count: number | null;
          playoff_format: string | null;
          playouts_enabled: boolean;
          playout_teams_count: number | null;
          playout_format: string | null;
          standings_tiebreak_order: string[];
        }
      >;
      teams: TableDefinition<
        TimestampFields & {
          id: string;
          season_id: string;
          name: string;
          slug: string;
          logo_url: string | null;
        }
      >;
      players: TableDefinition<
        TimestampFields & {
          id: string;
          profile_id: string | null;
          first_name: string;
          last_name: string;
          display_name: string;
          photo_url: string | null;
        }
      >;
      team_members: TableDefinition<
        TimestampFields & {
          id: string;
          season_id: string;
          team_id: string;
          player_id: string;
          position: 1 | 2;
        }
      >;
      matches: TableDefinition<
        TimestampFields & {
          id: string;
          season_id: string;
          phase: MatchPhase;
          home_team_id: string;
          away_team_id: string;
          scheduled_at: string | null;
          venue: string | null;
          status: MatchStatus;
          result_status: ResultStatus;
          home_sets_won: number;
          away_sets_won: number;
          notes: string | null;
        }
      >;
      match_sets: TableDefinition<
        TimestampFields & {
          id: string;
          match_id: string;
          set_number: 1 | 2 | 3;
          home_games: number;
          away_games: number;
        }
      >;
      gallery_albums: TableDefinition<
        TimestampFields & {
          id: string;
          season_id: string | null;
          tournament_id: string | null;
          title: string;
          description: string | null;
          is_public: boolean;
        }
      >;
      gallery_photos: TableDefinition<
        TimestampFields & {
          id: string;
          album_id: string;
          image_url: string;
          caption: string | null;
          sort_order: number;
          is_cover: boolean;
        }
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      profile_role: ProfileRole;
      tournament_status: TournamentStatus;
      season_status: SeasonStatus;
      match_phase: MatchPhase;
      match_status: MatchStatus;
      result_status: ResultStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
