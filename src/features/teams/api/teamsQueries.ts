import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createTeam,
  deleteTeam,
  listTeamsBySeason,
  updateTeam,
  uploadTeamLogo,
  type SaveTeamInput,
  type UpdateTeamInput
} from '@/features/teams/api/teamsApi';

export const teamQueryKeys = {
  all: ['teams'] as const,
  bySeason: (seasonId: string) => [...teamQueryKeys.all, 'by-season', seasonId] as const
};

export function useTeamsBySeasonQuery(seasonId: string | null) {
  return useQuery({
    queryKey: teamQueryKeys.bySeason(seasonId ?? 'none'),
    queryFn: () => listTeamsBySeason(seasonId ?? ''),
    enabled: Boolean(seasonId)
  });
}

export function useCreateTeamMutation(seasonId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SaveTeamInput) => createTeam(input),
    onSuccess: async () => {
      if (seasonId) {
        await queryClient.invalidateQueries({ queryKey: teamQueryKeys.bySeason(seasonId) });
      }
    }
  });
}

export function useUpdateTeamMutation(seasonId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateTeamInput) => updateTeam(input),
    onSuccess: async () => {
      if (seasonId) {
        await queryClient.invalidateQueries({ queryKey: teamQueryKeys.bySeason(seasonId) });
      }
    }
  });
}

export function useDeleteTeamMutation(seasonId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteTeam(id),
    onSuccess: async () => {
      if (seasonId) {
        await queryClient.invalidateQueries({ queryKey: teamQueryKeys.bySeason(seasonId) });
      }
    }
  });
}

export function useUploadTeamLogoMutation() {
  return useMutation({
    mutationFn: (file: File) => uploadTeamLogo(file)
  });
}
