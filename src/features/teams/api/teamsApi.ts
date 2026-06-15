import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/types';

export type Team = Database['public']['Tables']['teams']['Row'];
export type TeamMember = Database['public']['Tables']['team_members']['Row'];

export type TeamWithMembers = Team & {
  members: TeamMember[];
};

export type SaveTeamInput = {
  season_id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  player_ids: string[];
};

export type UpdateTeamInput = SaveTeamInput & {
  id: string;
};

function getStoragePath(folder: string, file: File): string {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').toLowerCase();
  return `${folder}/${crypto.randomUUID()}-${safeName}`;
}

function normalizePlayerIds(playerIds: string[]): string[] {
  return playerIds.map((playerId) => playerId.trim()).filter(Boolean);
}

async function validateTeamMembers(
  seasonId: string,
  playerIds: string[],
  currentTeamId: string | null
): Promise<void> {
  const normalizedPlayerIds = normalizePlayerIds(playerIds);
  const uniquePlayerIds = new Set(normalizedPlayerIds);

  if (normalizedPlayerIds.length > 2) {
    throw new Error('A team cannot have more than 2 players.');
  }

  if (uniquePlayerIds.size !== normalizedPlayerIds.length) {
    throw new Error('A player can be selected only once in the same team.');
  }

  if (normalizedPlayerIds.length === 0) {
    return;
  }

  const { data, error } = await supabase
    .from('team_members')
    .select('*')
    .eq('season_id', seasonId)
    .in('player_id', normalizedPlayerIds);

  if (error) {
    throw error;
  }

  const conflictingMembership = data.find((membership) => membership.team_id !== currentTeamId);

  if (conflictingMembership) {
    throw new Error('A player can belong to only one team in the selected season.');
  }
}

async function replaceTeamMembers(
  teamId: string,
  seasonId: string,
  playerIds: string[]
): Promise<void> {
  const normalizedPlayerIds = normalizePlayerIds(playerIds);
  const { error: deleteError } = await supabase.from('team_members').delete().eq('team_id', teamId);

  if (deleteError) {
    throw deleteError;
  }

  if (normalizedPlayerIds.length === 0) {
    return;
  }

  const { error: insertError } = await supabase.from('team_members').insert(
    normalizedPlayerIds.map((playerId, index) => ({
      season_id: seasonId,
      team_id: teamId,
      player_id: playerId,
      position: (index + 1) as 1 | 2
    }))
  );

  if (insertError) {
    throw insertError;
  }
}

export async function uploadTeamLogo(file: File): Promise<string> {
  const path = getStoragePath('teams', file);
  const { error } = await supabase.storage.from('team-logos').upload(path, file, {
    cacheControl: '3600',
    upsert: false
  });

  if (error) {
    throw error;
  }

  return supabase.storage.from('team-logos').getPublicUrl(path).data.publicUrl;
}

export async function listTeamsBySeason(seasonId: string): Promise<TeamWithMembers[]> {
  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('*')
    .eq('season_id', seasonId)
    .order('name', { ascending: true });

  if (teamsError) {
    throw teamsError;
  }

  const { data: members, error: membersError } = await supabase
    .from('team_members')
    .select('*')
    .eq('season_id', seasonId)
    .order('position', { ascending: true });

  if (membersError) {
    throw membersError;
  }

  return teams.map((team) => ({
    ...team,
    members: members.filter((member) => member.team_id === team.id)
  }));
}

export async function createTeam(input: SaveTeamInput): Promise<Team> {
  const playerIds = normalizePlayerIds(input.player_ids);
  await validateTeamMembers(input.season_id, playerIds, null);

  const { data, error } = await supabase
    .from('teams')
    .insert({
      season_id: input.season_id,
      name: input.name,
      slug: input.slug,
      logo_url: input.logo_url
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  try {
    await replaceTeamMembers(data.id, input.season_id, playerIds);
  } catch (error) {
    await deleteTeam(data.id);
    throw error;
  }

  return data;
}

export async function updateTeam(input: UpdateTeamInput): Promise<Team> {
  const playerIds = normalizePlayerIds(input.player_ids);
  await validateTeamMembers(input.season_id, playerIds, input.id);

  const { data, error } = await supabase
    .from('teams')
    .update({
      season_id: input.season_id,
      name: input.name,
      slug: input.slug,
      logo_url: input.logo_url
    })
    .eq('id', input.id)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  await replaceTeamMembers(input.id, input.season_id, playerIds);

  return data;
}

export async function deleteTeam(id: string): Promise<void> {
  const { error } = await supabase.from('teams').delete().eq('id', id);

  if (error) {
    throw error;
  }
}
