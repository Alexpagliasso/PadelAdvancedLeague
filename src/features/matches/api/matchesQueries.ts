import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createMatch,
  generateRoundRobinCalendar,
  listMatchesBySeason,
  resetMatchResult,
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

export function useResetMatchResultMutation(seasonId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => resetMatchResult(id),
    onSuccess: async () => {
      if (seasonId) {
        await queryClient.invalidateQueries({ queryKey: matchQueryKeys.bySeason(seasonId) });
      }
    }
  });
}

export function useGenerateCalendarMutation(seasonId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ teamIds }: { teamIds: string[] }) => {
      if (!seasonId) {
        throw new Error('Seleziona un torneo attivo prima di generare il calendario.');
      }

      return generateRoundRobinCalendar(seasonId, teamIds);
    },
    onSuccess: async () => {
      if (seasonId) {
        await queryClient.invalidateQueries({ queryKey: matchQueryKeys.bySeason(seasonId) });
      }
    }
  });
}
