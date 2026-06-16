export const appPaths = {
  home: '/',
  auth: '/auth',
  admin: '/admin',
  adminTournaments: '/admin/tournaments',
  adminTeams: '/admin/teams',
  adminPlayers: '/admin/players',
  adminMatches: '/admin/matches',
  adminCalendar: '/admin/calendar',
  adminStandings: '/admin/standings',
  adminSettings: '/admin/settings',
  profile: '/profile'
} as const;

export type AppPath = (typeof appPaths)[keyof typeof appPaths];
