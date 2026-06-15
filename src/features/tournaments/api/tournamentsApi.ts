import { supabase } from '@/lib/supabase/client';
import type { Database, SeasonStatus, TournamentStatus } from '@/lib/supabase/types';

export type Tournament = Database['public']['Tables']['tournaments']['Row'];
export type Season = Database['public']['Tables']['seasons']['Row'];
export type SeasonSettings = Database['public']['Tables']['season_settings']['Row'];

export type TournamentWithSeasons = Tournament & {
  seasons: Season[];
};

export type CreateTournamentInput = {
  name: string;
  slug: string;
  description: string | null;
  is_public: boolean;
};

export type UpdateTournamentInput = CreateTournamentInput & {
  id: string;
  status: TournamentStatus;
};

export type CreateSeasonInput = {
  tournament_id: string;
  name: string;
  slug: string;
  starts_on: string | null;
  ends_on: string | null;
  is_public: boolean;
};

export type UpdateSeasonInput = CreateSeasonInput & {
  id: string;
  status: SeasonStatus;
};

export type UpdateSeasonSettingsInput = {
  season_id: string;
  regular_season_label: string;
  playoffs_enabled: boolean;
  playoff_teams_count: number | null;
  playoff_format: string | null;
  playouts_enabled: boolean;
  playout_teams_count: number | null;
  playout_format: string | null;
  standings_tiebreak_order: string[];
};

export async function listAdminTournaments(): Promise<TournamentWithSeasons[]> {
  const { data: tournaments, error: tournamentsError } = await supabase
    .from('tournaments')
    .select('*')
    .order('created_at', { ascending: false });

  if (tournamentsError) {
    throw tournamentsError;
  }

  const { data: seasons, error: seasonsError } = await supabase
    .from('seasons')
    .select('*')
    .order('created_at', { ascending: false });

  if (seasonsError) {
    throw seasonsError;
  }

  return tournaments.map((tournament) => {
    const tournamentSeasons = seasons.filter((season) => season.tournament_id === tournament.id);

    return {
      ...tournament,
      seasons: tournamentSeasons
    };
  });
}

export async function createTournament(input: CreateTournamentInput): Promise<Tournament> {
  const { data, error } = await supabase
    .from('tournaments')
    .insert({
      ...input,
      status: 'draft'
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  const { data: season, error: seasonError } = await supabase
    .from('seasons')
    .insert({
      tournament_id: data.id,
      name: 'Stagione principale',
      slug: 'main',
      status: 'active',
      starts_on: null,
      ends_on: null,
      is_public: true
    })
    .select('*')
    .single();

  if (seasonError) {
    await deleteTournament(data.id);
    throw seasonError;
  }

  try {
    await ensureSeasonSettings(season.id);
  } catch (settingsError) {
    await deleteTournament(data.id);
    throw settingsError;
  }

  return data;
}

export async function updateTournament(input: UpdateTournamentInput): Promise<Tournament> {
  const { id, ...values } = input;

  if (values.status === 'active') {
    const { error: deactivateError } = await supabase
      .from('tournaments')
      .update({ status: 'draft' })
      .eq('status', 'active')
      .neq('id', id);

    if (deactivateError) {
      throw deactivateError;
    }
  }

  const { data, error } = await supabase
    .from('tournaments')
    .update(values)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateTournamentStatus(
  id: string,
  status: TournamentStatus
): Promise<Tournament> {
  if (status === 'active') {
    const { error: deactivateError } = await supabase
      .from('tournaments')
      .update({ status: 'draft' })
      .eq('status', 'active')
      .neq('id', id);

    if (deactivateError) {
      throw deactivateError;
    }
  }

  const { data, error } = await supabase
    .from('tournaments')
    .update({ status })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteTournament(id: string): Promise<void> {
  const { error } = await supabase.from('tournaments').delete().eq('id', id);

  if (error) {
    throw error;
  }
}

export async function listSeasonsByTournament(tournamentId: string): Promise<Season[]> {
  const { data, error } = await supabase
    .from('seasons')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data;
}

export async function createSeason(input: CreateSeasonInput): Promise<Season> {
  const { data, error } = await supabase
    .from('seasons')
    .insert({
      ...input,
      status: 'draft'
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  await ensureSeasonSettings(data.id);

  return data;
}

export async function updateSeason(input: UpdateSeasonInput): Promise<Season> {
  const { id, ...values } = input;
  const { data, error } = await supabase
    .from('seasons')
    .update(values)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function getSeasonSettings(seasonId: string): Promise<SeasonSettings> {
  const { data, error } = await supabase
    .from('season_settings')
    .select('*')
    .eq('season_id', seasonId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) {
    return data;
  }

  return ensureSeasonSettings(seasonId);
}

export async function ensureSeasonSettings(seasonId: string): Promise<SeasonSettings> {
  const { data, error } = await supabase
    .from('season_settings')
    .insert({ season_id: seasonId })
    .select('*')
    .single();

  if (error) {
    const existing = await supabase
      .from('season_settings')
      .select('*')
      .eq('season_id', seasonId)
      .single();

    if (existing.error) {
      throw error;
    }

    return existing.data;
  }

  return data;
}

export async function updateSeasonSettings(
  input: UpdateSeasonSettingsInput
): Promise<SeasonSettings> {
  const { data, error } = await supabase
    .from('season_settings')
    .upsert(input, { onConflict: 'season_id' })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}
