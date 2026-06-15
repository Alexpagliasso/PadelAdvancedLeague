export const appPaths = {
  home: '/',
  auth: '/auth',
  admin: '/admin',
  adminTournaments: '/admin/tournaments',
  adminTeams: '/admin/teams',
  adminPlayers: '/admin/players',
  adminMatches: '/admin/matches',
  adminGallery: '/admin/gallery',
  adminSettings: '/admin/settings',
  profile: '/profile'
} as const;

export type AppPath = (typeof appPaths)[keyof typeof appPaths];
