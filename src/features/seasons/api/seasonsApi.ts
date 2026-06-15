import { supabase } from '@/lib/supabase/client';
import type { SeasonStatus } from '@/lib/supabase/types';
import {
  createSeason,
  getSeasonSettings,
  listSeasonsByTournament,
  updateSeason,
  updateSeasonSettings,
  type CreateSeasonInput,
  type Season,
  type SeasonSettings,
  type UpdateSeasonInput,
  type UpdateSeasonSettingsInput
} from '@/features/tournaments/api/tournamentsApi';

export {
  createSeason,
  getSeasonSettings,
  listSeasonsByTournament,
  updateSeason,
  updateSeasonSettings,
  type CreateSeasonInput,
  type Season,
  type SeasonSettings,
  type UpdateSeasonInput,
  type UpdateSeasonSettingsInput
};

export async function updateSeasonStatus(id: string, status: SeasonStatus): Promise<Season> {
  const { data, error } = await supabase
    .from('seasons')
    .update({ status })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}
