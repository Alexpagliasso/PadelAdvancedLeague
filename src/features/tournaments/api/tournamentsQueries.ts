import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createSeason,
  createConfiguredTournament,
  createTournament,
  deleteTournament,
  getSeasonSettings,
  listAdminTournaments,
  listSeasonsByTournament,
  updateSeason,
  updateSeasonSettings,
  updateTournament,
  updateTournamentCompetitionSettings,
  updateTournamentStatus,
  type CreateSeasonInput,
  type CreateConfiguredTournamentInput,
  type CreateTournamentInput,
  type UpdateSeasonInput,
  type UpdateSeasonSettingsInput,
  type UpdateTournamentCompetitionSettingsInput,
  type UpdateTournamentInput
} from '@/features/tournaments/api/tournamentsApi';
import type { TournamentStatus } from '@/lib/supabase/types';

export const tournamentQueryKeys = {
  all: ['tournaments'] as const,
  adminList: () => [...tournamentQueryKeys.all, 'admin-list'] as const,
  seasons: (tournamentId: string) => [...tournamentQueryKeys.all, tournamentId, 'seasons'] as const,
  settings: (seasonId: string) => [...tournamentQueryKeys.all, 'settings', seasonId] as const
};

export function useAdminTournamentsQuery() {
  return useQuery({
    queryKey: tournamentQueryKeys.adminList(),
    queryFn: listAdminTournaments
  });
}

export function useSeasonsQuery(tournamentId: string | null) {
  return useQuery({
    queryKey: tournamentQueryKeys.seasons(tournamentId ?? 'none'),
    queryFn: () => listSeasonsByTournament(tournamentId ?? ''),
    enabled: Boolean(tournamentId)
  });
}

export function useSeasonSettingsQuery(seasonId: string | null) {
  return useQuery({
    queryKey: tournamentQueryKeys.settings(seasonId ?? 'none'),
    queryFn: () => getSeasonSettings(seasonId ?? ''),
    enabled: Boolean(seasonId)
  });
}

export function useCreateTournamentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTournamentInput) => createTournament(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tournamentQueryKeys.adminList() });
    }
  });
}

export function useCreateConfiguredTournamentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateConfiguredTournamentInput) => createConfiguredTournament(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tournamentQueryKeys.adminList() });
    }
  });
}

export function useUpdateTournamentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateTournamentInput) => updateTournament(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tournamentQueryKeys.adminList() });
    }
  });
}

export function useUpdateTournamentCompetitionSettingsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateTournamentCompetitionSettingsInput) =>
      updateTournamentCompetitionSettings(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tournamentQueryKeys.adminList() });
    }
  });
}

export function useUpdateTournamentStatusMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TournamentStatus }) =>
      updateTournamentStatus(id, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tournamentQueryKeys.adminList() });
    }
  });
}

export function useDeleteTournamentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteTournament(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tournamentQueryKeys.adminList() });
    }
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
          ? queryClient.invalidateQueries({ queryKey: tournamentQueryKeys.seasons(tournamentId) })
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
          ? queryClient.invalidateQueries({ queryKey: tournamentQueryKeys.seasons(tournamentId) })
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
        await queryClient.invalidateQueries({ queryKey: tournamentQueryKeys.settings(seasonId) });
      }
    }
  });
}
