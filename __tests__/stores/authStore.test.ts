/**
 * authStore — unit tests
 * Covers: setUser, setSchool, switchRole, signOut, active_role resolution
 */
import { act } from '@testing-library/react-native';

jest.mock('../../lib/supabase', () => require('../__mocks__/supabase'));
jest.mock('expo-secure-store');

import { useAuthStore } from '../../stores/authStore';
import type { UserRole } from '../../types/database';

const SCHOOL = {
  id: 'school-1', name: 'Test School', code: 'TST',
  primary_color: '#000', secondary_color: '#fff', logo_url: null,
  currency: 'ZMW', timezone: 'Africa/Lusaka', subscription_plan: 'basic',
  is_active: true, country: 'ZM', subscription_status: 'active',
  created_at: '2024-01-01T00:00:00Z',
};

const USER = {
  id: 'user-1',
  email: 'admin@test.com',
  schoolId: 'school-1',
  staffId: 'staff-1',
  parentId: null,
  studentId: null,
  roles: ['admin', 'hrt'] as UserRole[],
  activeRole: 'admin' as UserRole,
  fullName: 'Test Admin',
};

describe('authStore', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, school: null, isReady: false });
  });

  it('setUser stores user', () => {
    act(() => useAuthStore.getState().setUser(USER));
    expect(useAuthStore.getState().user?.id).toBe('user-1');
  });

  it('setReady marks store ready', () => {
    act(() => useAuthStore.getState().setReady(true));
    expect(useAuthStore.getState().isReady).toBe(true);
  });

  it('setSchool stores school', () => {
    act(() => useAuthStore.getState().setSchool(SCHOOL as any));
    expect(useAuthStore.getState().school?.code).toBe('TST');
  });

  it('switchRole changes activeRole', () => {
    act(() => useAuthStore.getState().setUser(USER));
    act(() => useAuthStore.getState().switchRole('hrt'));
    expect(useAuthStore.getState().user?.activeRole).toBe('hrt');
  });

  it('switchRole to invalid role is rejected by guard', () => {
    act(() => useAuthStore.getState().setUser(USER));
    act(() => useAuthStore.getState().switchRole('finance' as UserRole));
    expect(useAuthStore.getState().user?.activeRole).toBe('admin');
  });

  it('signOut clears user and school', async () => {
    act(() => { useAuthStore.getState().setUser(USER); useAuthStore.getState().setSchool(SCHOOL as any); });
    await act(() => useAuthStore.getState().signOut());
    const s = useAuthStore.getState();
    expect(s.user).toBeNull();
    expect(s.school).toBeNull();
  });

  it('setLoading toggles isLoading', () => {
    act(() => useAuthStore.getState().setLoading(true));
    expect(useAuthStore.getState().isLoading).toBe(true);
    act(() => useAuthStore.getState().setLoading(false));
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it('loadPersistedSchool returns null when nothing persisted', async () => {
    const SecureStore = require('expo-secure-store');
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    const result = await useAuthStore.getState().loadPersistedSchool();
    expect(result).toBeNull();
  });

  it('loadPersistedSchool loads from SecureStore when persisted', async () => {
    const SecureStore = require('expo-secure-store');
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(SCHOOL));
    const result = await useAuthStore.getState().loadPersistedSchool();
    expect(result?.code).toBe('TST');
    expect(useAuthStore.getState().school?.code).toBe('TST');
  });

  it('loadPersistedSchool returns null on parse error', async () => {
    const SecureStore = require('expo-secure-store');
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('INVALID_JSON{{{');
    const result = await useAuthStore.getState().loadPersistedSchool();
    expect(result).toBeNull();
  });
});
