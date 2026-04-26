import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '../lib/supabase';
import type { UserRole, School } from '../types/database';

const PERSISTED_SCHOOL_KEY = 'escholr_persisted_school';

interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  staffId: string | null;
  parentId: string | null;
  roles: UserRole[];
  activeRole: UserRole;
  schoolId: string | null;
}

interface AuthState {
  user: AuthUser | null;
  school: School | null;
  isLoading: boolean;
  isReady: boolean;
  setUser: (user: AuthUser | null) => void;
  setSchool: (school: School | null) => void;
  setLoading: (v: boolean) => void;
  setReady: (v: boolean) => void;
  switchRole: (role: UserRole) => void;
  loadPersistedSchool: () => Promise<School | null>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  school: null,
  isLoading: false,
  isReady: false,
  setUser: (user) => set({ user }),
  setSchool: (school) => {
    set({ school });
    if (school) {
      SecureStore.setItemAsync(PERSISTED_SCHOOL_KEY, JSON.stringify(school)).catch(() => {});
    }
  },
  setLoading: (isLoading) => set({ isLoading }),
  setReady: (isReady) => set({ isReady }),
  switchRole: (role) =>
    set((s) => ({
      user: s.user ? { ...s.user, activeRole: role } : null,
    })),
  loadPersistedSchool: async () => {
    try {
      const raw = await SecureStore.getItemAsync(PERSISTED_SCHOOL_KEY);
      if (raw) {
        const school = JSON.parse(raw) as School;
        set({ school });
        return school;
      }
    } catch {}
    return null;
  },
  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, school: null });
    // Clear persisted school for platform admin (no school to remember)
    // School users get school re-fetched from persisted key on next boot
  },
}));
