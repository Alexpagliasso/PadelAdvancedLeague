import { useQuery } from '@tanstack/react-query';

import {
  getPublicTournamentData,
  listPublicTournaments
} from '@/features/public/api/publicTournamentApi';

export const publicTournamentQueryKeys = {
  all: ['public-tournament'] as const,
  list: () => [...publicTournamentQueryKeys.all, 'list'] as const,
  detail: (slug: string | null) => [...publicTournamentQueryKeys.all, slug ?? 'active'] as const
};

export function usePublicTournamentsQuery() {
  return useQuery({
    queryKey: publicTournamentQueryKeys.list(),
    queryFn: listPublicTournaments
  });
}

export function usePublicTournamentQuery(slug: string | null, enabled = true) {
  return useQuery({
    queryKey: publicTournamentQueryKeys.detail(slug),
    queryFn: () => getPublicTournamentData(slug),
    enabled
  });
}
