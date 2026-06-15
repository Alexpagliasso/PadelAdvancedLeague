export const appPaths = {
  home: '/',
  auth: '/auth',
  admin: '/admin',
  profile: '/profile'
} as const;

export type AppPath = (typeof appPaths)[keyof typeof appPaths];
