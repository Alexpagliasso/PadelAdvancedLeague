import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createMatch,
  generatePlayoffPlayoutBrackets,
  generateRoundRobinCalendar,
  getMatchById,
  listTournamentBrackets,
  listMatchesBySeason,
  resetMatchResult,
  updateMatch,
  type GeneratePlayoffPlayoutInput,
  type SaveMatchInput,
  type UpdateMatchInput
} from '@/features/matches/api/matchesApi';
import { publicTournamentQueryKeys } from '@/features/public/api/publicTournamentQueries';
import { tournamentQueryKeys } from '@/features/tournaments/api/tournamentsQueries';

export const matchQueryKeys = {
  all: ['matches'] as const,
  detail: (matchId: string) => [...matchQueryKeys.all, 'detail', matchId] as const,
  bySeason: (seasonId: string) => [...matchQueryKeys.all, 'by-season', seasonId] as const,
  bracketsByTournament: (tournamentId: string) =>
    [...matchQueryKeys.all, 'brackets', 'by-tournament', tournamentId] as const
};

export function useMatchQuery(matchId: string | null) {
  return useQuery({
    queryKey: matchQueryKeys.detail(matchId ?? 'none'),
    queryFn: () => getMatchById(matchId ?? ''),
    enabled: Boolean(matchId)
  });
}

export function useMatchesBySeasonQuery(seasonId: string | null) {
  return useQuery({
    queryKey: matchQueryKeys.bySeason(seasonId ?? 'none'),
    queryFn: () => listMatchesBySeason(seasonId ?? ''),
    enabled: Boolean(seasonId)
  });
}

export function useTournamentBracketsQuery(tournamentId: string | null) {
  return useQuery({
    queryKey: matchQueryKeys.bracketsByTournament(tournamentId ?? 'none'),
    queryFn: () => listTournamentBrackets(tournamentId ?? ''),
    enabled: Boolean(tournamentId)
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
      await Promise.all([
        seasonId
          ? queryClient.invalidateQueries({ queryKey: matchQueryKeys.bySeason(seasonId) })
          : Promise.resolve(),
        queryClient.invalidateQueries({ queryKey: matchQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: publicTournamentQueryKeys.all })
      ]);
    }
  });
}

export function useResetMatchResultMutation(seasonId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => resetMatchResult(id),
    onSuccess: async () => {
      await Promise.all([
        seasonId
          ? queryClient.invalidateQueries({ queryKey: matchQueryKeys.bySeason(seasonId) })
          : Promise.resolve(),
        queryClient.invalidateQueries({ queryKey: matchQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: publicTournamentQueryKeys.all })
      ]);
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

export function useGeneratePlayoffPlayoutMutation(
  tournamentId: string | null,
  seasonId: string | null
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Omit<GeneratePlayoffPlayoutInput, 'tournamentId' | 'seasonId'>) => {
      if (!tournamentId || !seasonId) {
        throw new Error('Seleziona un torneo prima di generare playoff e playout.');
      }

      return generatePlayoffPlayoutBrackets({
        tournamentId,
        seasonId,
        ...input
      });
    },
    onSuccess: async () => {
      await Promise.all([
        tournamentId
          ? queryClient.invalidateQueries({
              queryKey: matchQueryKeys.bracketsByTournament(tournamentId)
            })
          : Promise.resolve(),
        seasonId
          ? queryClient.invalidateQueries({ queryKey: matchQueryKeys.bySeason(seasonId) })
          : Promise.resolve(),
        queryClient.invalidateQueries({ queryKey: publicTournamentQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: tournamentQueryKeys.adminList() })
      ]);
    }
  });
}
