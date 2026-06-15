import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/types';

export type Player = Database['public']['Tables']['players']['Row'];
export type Profile = Database['public']['Tables']['profiles']['Row'];

export type CreatePlayerInput = {
  profile_id: string | null;
  first_name: string;
  last_name: string;
  display_name: string;
  photo_url: string | null;
};

export type UpdatePlayerInput = CreatePlayerInput & {
  id: string;
};

function getStoragePath(folder: string, file: File): string {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').toLowerCase();
  return `${folder}/${crypto.randomUUID()}-${safeName}`;
}

export async function uploadPlayerPhoto(file: File): Promise<string> {
  const path = getStoragePath('players', file);
  const { error } = await supabase.storage.from('avatars').upload(path, file, {
    cacheControl: '3600',
    upsert: false
  });

  if (error) {
    throw error;
  }

  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}

export async function listPlayers(): Promise<Player[]> {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true });

  if (error) {
    throw error;
  }

  return data;
}

export async function listProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('full_name', { ascending: true });

  if (error) {
    throw error;
  }

  return data;
}

export async function createPlayer(input: CreatePlayerInput): Promise<Player> {
  const { data, error } = await supabase.from('players').insert(input).select('*').single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updatePlayer(input: UpdatePlayerInput): Promise<Player> {
  const { id, ...values } = input;
  const { data, error } = await supabase
    .from('players')
    .update(values)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function deletePlayer(id: string): Promise<void> {
  const { error } = await supabase.from('players').delete().eq('id', id);

  if (error) {
    throw error;
  }
}
