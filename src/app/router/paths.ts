export const appPaths = {
  home: '/',
  auth: '/auth',
  admin: '/admin',
  adminTournaments: '/admin/tournaments',
  adminTournamentSeasons: (tournamentId: string) => `/admin/tournaments/${tournamentId}/seasons`,
  adminSeasonSettings: (seasonId: string) => `/admin/seasons/${seasonId}/settings`,
  adminTeams: '/admin/teams',
  adminPlayers: '/admin/players',
  adminMatches: '/admin/matches',
  adminGallery: '/admin/gallery',
  adminSettings: '/admin/settings',
  profile: '/profile'
} as const;

export type AppPath = Exclude<(typeof appPaths)[keyof typeof appPaths], (...args: never[]) => string>;
