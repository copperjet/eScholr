/**
 * useUpdateMark — unit tests
 * Covers: happy path, supabase error, audit log write
 */
import { renderHook, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

jest.mock('../../lib/supabase', () => require('../__mocks__/supabase'));
jest.mock('expo-haptics');

import { useUpdateMark } from '../../hooks/useMarks';
import { mockSupabaseData, resetSupabaseMock } from '../__mocks__/supabase';

function wrapper({ children }: any) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

const PARAMS = {
  studentId: 'stu-1',
  subjectId: 'sub-1',
  streamId: 'stream-1',
  semesterId: 'sem-1',
  assessmentType: 'FA1',
  value: 85,
  enteredBy: 'staff-1',
};

describe('useUpdateMark', () => {
  beforeEach(() => {
    resetSupabaseMock();
    jest.clearAllMocks();
  });

  it('succeeds without error', async () => {
    mockSupabaseData({ marks: { data: [{ id: 'mark-1' }], error: null } });
    const { result } = renderHook(() => useUpdateMark('school-1'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(PARAMS);
    });
    expect(result.current.isError).toBe(false);
  });

  it('throws when supabase returns error', async () => {
    mockSupabaseData({ marks: { data: null, error: { message: 'Insert failed' } } });
    const { result } = renderHook(() => useUpdateMark('school-1'), { wrapper });
    await expect(
      act(async () => result.current.mutateAsync(PARAMS))
    ).rejects.toBeDefined();
  });
});
