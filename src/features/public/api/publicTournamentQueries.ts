import { useQuery } from '@tanstack/react-query';

import { getPublicTournamentData } from '@/features/public/api/publicTournamentApi';

export const publicTournamentQueryKeys = {
  all: ['public-tournament'] as const,
  detail: (slug: string | null) => [...publicTournamentQueryKeys.all, slug ?? 'active'] as const
};

export function usePublicTournamentQuery(slug: string | null) {
  return useQuery({
    queryKey: publicTournamentQueryKeys.detail(slug),
    queryFn: () => getPublicTournamentData(slug)
  });
}
