import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { tournamentQueryKeys } from '@/features/tournaments/api/tournamentsQueries';
import type { SeasonStatus } from '@/lib/supabase/types';

import {
  createSeason,
  getSeasonSettings,
  listSeasonsByTournament,
  updateSeason,
  updateSeasonSettings,
  updateSeasonStatus,
  type CreateSeasonInput,
  type UpdateSeasonInput,
  type UpdateSeasonSettingsInput
} from '@/features/seasons/api/seasonsApi';

export const seasonQueryKeys = {
  all: ['seasons'] as const,
  byTournament: (tournamentId: string) =>
    [...seasonQueryKeys.all, 'by-tournament', tournamentId] as const,
  settings: (seasonId: string) => [...seasonQueryKeys.all, 'settings', seasonId] as const
};

export function useTournamentSeasonsQuery(tournamentId: string | null) {
  return useQuery({
    queryKey: seasonQueryKeys.byTournament(tournamentId ?? 'none'),
    queryFn: () => listSeasonsByTournament(tournamentId ?? ''),
    enabled: Boolean(tournamentId)
  });
}

export function useSeasonSettingsQuery(seasonId: string | null) {
  return useQuery({
    queryKey: seasonQueryKeys.settings(seasonId ?? 'none'),
    queryFn: () => getSeasonSettings(seasonId ?? ''),
    enabled: Boolean(seasonId)
  });
}

export function useCreateSeasonMutation(tournamentId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateSeasonInput) => createSeason(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: tournamentQueryKeys.adminList() }),
        tournamentId
          ? queryClient.invalidateQueries({ queryKey: seasonQueryKeys.byTournament(tournamentId) })
          : Promise.resolve()
      ]);
    }
  });
}

export function useUpdateSeasonMutation(tournamentId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateSeasonInput) => updateSeason(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: tournamentQueryKeys.adminList() }),
        tournamentId
          ? queryClient.invalidateQueries({ queryKey: seasonQueryKeys.byTournament(tournamentId) })
          : Promise.resolve()
      ]);
    }
  });
}

export function useUpdateSeasonStatusMutation(tournamentId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: SeasonStatus }) =>
      updateSeasonStatus(id, status),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: tournamentQueryKeys.adminList() }),
        tournamentId
          ? queryClient.invalidateQueries({ queryKey: seasonQueryKeys.byTournament(tournamentId) })
          : Promise.resolve()
      ]);
    }
  });
}

export function useUpdateSeasonSettingsMutation(seasonId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateSeasonSettingsInput) => updateSeasonSettings(input),
    onSuccess: async () => {
      if (seasonId) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: seasonQueryKeys.settings(seasonId) }),
          queryClient.invalidateQueries({ queryKey: tournamentQueryKeys.settings(seasonId) })
        ]);
      }
    }
  });
}
