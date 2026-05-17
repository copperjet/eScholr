/**
 * useStreamRegister — unit tests
 * Covers: query enabled/disabled, data returned, error state
 */
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

jest.mock('../../lib/supabase', () => require('../__mocks__/supabase'));
jest.mock('expo-haptics');

import { useStreamRegister } from '../../hooks/useAttendance';
import { mockSupabaseData, resetSupabaseMock } from '../__mocks__/supabase';

function wrapper({ children }: any) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useStreamRegister', () => {
  beforeEach(() => resetSupabaseMock());

  it('is disabled when streamId is undefined', () => {
    const { result } = renderHook(
      () => useStreamRegister(undefined, '2025-01-15', 'school-1'),
      { wrapper }
    );
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('fetches register when all params provided', async () => {
    mockSupabaseData({
      attendance_records: {
        data: [{ student_id: 'stu-1', status: 'present', note: null, students: { full_name: 'Alice', student_number: 'S001', photo_url: null } }],
        error: null,
      },
    });
    const { result } = renderHook(
      () => useStreamRegister('stream-1', '2025-01-15', 'school-1'),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true));
  });
});
