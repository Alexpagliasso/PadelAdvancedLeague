import type { CompetitionPhase, TournamentFormat } from '@/lib/supabase/types';

export type { CompetitionPhase, TournamentFormat };

export const tournamentFormatLabels: Record<TournamentFormat, string> = {
  round_robin: "Girone all'italiana",
  knockout: 'Eliminazione diretta',
  group_playoff_playout: 'Girone + playoff/playout'
};

export const tournamentFormatDescriptions: Record<TournamentFormat, string> = {
  round_robin: 'Tutte le squadre si affrontano una volta, con classifica finale.',
  knockout: 'Tabellone a eliminazione diretta, con bye automatici se abilitati.',
  group_playoff_playout: 'Fase a gironi iniziale, poi tabelloni playoff e/o playout.'
};

export const competitionPhaseLabels: Record<CompetitionPhase, string> = {
  setup: 'Configurazione',
  regular_season: 'Fase a gironi',
  knockout: 'Eliminazione diretta',
  completed: 'Completato'
};

export const tournamentFormatOptions: TournamentFormat[] = [
  'round_robin',
  'knockout',
  'group_playoff_playout'
];
