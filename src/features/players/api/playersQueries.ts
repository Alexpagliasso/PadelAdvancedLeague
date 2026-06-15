import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createPlayer,
  deletePlayer,
  listPlayers,
  listProfiles,
  updatePlayer,
  uploadPlayerPhoto,
  type CreatePlayerInput,
  type UpdatePlayerInput
} from '@/features/players/api/playersApi';

export const playerQueryKeys = {
  all: ['players'] as const,
  list: () => [...playerQueryKeys.all, 'list'] as const,
  profiles: () => [...playerQueryKeys.all, 'profiles'] as const
};

export function usePlayersQuery() {
  return useQuery({
    queryKey: playerQueryKeys.list(),
    queryFn: listPlayers
  });
}

export function useProfilesQuery() {
  return useQuery({
    queryKey: playerQueryKeys.profiles(),
    queryFn: listProfiles
  });
}

export function useCreatePlayerMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreatePlayerInput) => createPlayer(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: playerQueryKeys.list() });
    }
  });
}

export function useUpdatePlayerMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdatePlayerInput) => updatePlayer(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: playerQueryKeys.list() });
    }
  });
}

export function useDeletePlayerMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deletePlayer(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: playerQueryKeys.list() });
    }
  });
}

export function useUploadPlayerPhotoMutation() {
  return useMutation({
    mutationFn: (file: File) => uploadPlayerPhoto(file)
  });
}
