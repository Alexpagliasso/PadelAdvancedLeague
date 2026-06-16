/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/* eslint-disable @typescript-eslint/consistent-type-definitions */

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL2: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY2: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
