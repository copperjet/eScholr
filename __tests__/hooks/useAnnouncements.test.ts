/**
 * useCreateAnnouncement — unit tests
 * Covers: happy path, error path, audience targeting
 */
import { renderHook, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

jest.mock('../../lib/supabase', () => require('../__mocks__/supabase'));
jest.mock('expo-haptics');

import { useCreateAnnouncement } from '../../hooks/useAnnouncements';
import { mockSupabaseData, resetSupabaseMock } from '../__mocks__/supabase';

function wrapper({ children }: any) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

const BASE = {
  school_id: 'school-1',
  author_id: 'staff-1',
  title: 'Test Announcement',
  body: 'Hello school!',
  audience_type: 'school' as const,
  attachment_url: null,
};

describe('useCreateAnnouncement', () => {
  beforeEach(() => { resetSupabaseMock(); jest.clearAllMocks(); });

  it('succeeds without error', async () => {
    mockSupabaseData({ announcements: { data: [{ id: 'ann-1' }], error: null } });
    const { result } = renderHook(() => useCreateAnnouncement(), { wrapper });
    await act(async () => { await result.current.mutateAsync(BASE); });
    expect(result.current.isError).toBe(false);
  });

  it('throws on insert error', async () => {
    mockSupabaseData({ announcements: { data: null, error: { message: 'Insert failed' } } });
    const { result } = renderHook(() => useCreateAnnouncement(), { wrapper });
    await expect(
      act(async () => result.current.mutateAsync(BASE))
    ).rejects.toBeDefined();
  });

  it('accepts stream-targeted announcement', async () => {
    mockSupabaseData({ announcements: { data: [{ id: 'ann-2' }], error: null } });
    const { result } = renderHook(() => useCreateAnnouncement(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ ...BASE, audience_type: 'stream' as const, audience_stream_id: 'stream-1' });
    });
    expect(result.current.isError).toBe(false);
  });
});
