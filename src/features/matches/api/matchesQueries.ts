import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createMatch,
  deleteMatch,
  listMatchesBySeason,
  updateMatch,
  type SaveMatchInput,
  type UpdateMatchInput
} from '@/features/matches/api/matchesApi';

export const matchQueryKeys = {
  all: ['matches'] as const,
  bySeason: (seasonId: string) => [...matchQueryKeys.all, 'by-season', seasonId] as const
};

export function useMatchesBySeasonQuery(seasonId: string | null) {
  return useQuery({
    queryKey: matchQueryKeys.bySeason(seasonId ?? 'none'),
    queryFn: () => listMatchesBySeason(seasonId ?? ''),
    enabled: Boolean(seasonId)
  });
}

export function useCreateMatchMutation(seasonId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SaveMatchInput) => createMatch(input),
    onSuccess: async () => {
      if (seasonId) {
        await queryClient.invalidateQueries({ queryKey: matchQueryKeys.bySeason(seasonId) });
      }
    }
  });
}

export function useUpdateMatchMutation(seasonId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateMatchInput) => updateMatch(input),
    onSuccess: async () => {
      if (seasonId) {
        await queryClient.invalidateQueries({ queryKey: matchQueryKeys.bySeason(seasonId) });
      }
    }
  });
}

export function useDeleteMatchMutation(seasonId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteMatch(id),
    onSuccess: async () => {
      if (seasonId) {
        await queryClient.invalidateQueries({ queryKey: matchQueryKeys.bySeason(seasonId) });
      }
    }
  });
}
