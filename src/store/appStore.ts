import { create } from 'zustand';

type AppState = {
  isNavigationOpen: boolean;
};

type AppActions = {
  closeNavigation: () => void;
  openNavigation: () => void;
  toggleNavigation: () => void;
};

export const useAppStore = create<AppState & AppActions>((set) => ({
  isNavigationOpen: false,
  closeNavigation: () => {
    set({ isNavigationOpen: false });
  },
  openNavigation: () => {
    set({ isNavigationOpen: true });
  },
  toggleNavigation: () => {
    set((state) => ({ isNavigationOpen: !state.isNavigationOpen }));
  }
}));
