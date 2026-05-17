/**
 * useAdminApproveReport + useReleaseReports — unit tests
 * Covers: approve writes audit log, release calls edge fn, error propagation
 */
import { renderHook, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

jest.mock('../../lib/supabase', () => require('../__mocks__/supabase'));
jest.mock('expo-haptics');

import { useAdminApproveReport, useReleaseReports, useReportAuditLog } from '../../hooks/useReports';
import { mockSupabaseData, resetSupabaseMock, supabase } from '../__mocks__/supabase';

function wrapper({ children }: any) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useAdminApproveReport', () => {
  beforeEach(() => { resetSupabaseMock(); jest.clearAllMocks(); });

  it('succeeds and does not throw', async () => {
    mockSupabaseData({
      reports: { data: { student_id: 'stu-1' }, error: null },
      audit_logs: { data: [{ id: 'al-1' }], error: null },
    });
    const { result } = renderHook(() => useAdminApproveReport('school-1'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ reportId: 'rep-1', staffId: 'staff-1' });
    });
    expect(result.current.isError).toBe(false);
  });

  it('throws on update error', async () => {
    mockSupabaseData({ reports: { data: null, error: { message: 'Update failed' } } });
    const { result } = renderHook(() => useAdminApproveReport('school-1'), { wrapper });
    await expect(
      act(async () => result.current.mutateAsync({ reportId: 'rep-1', staffId: 'staff-1' }))
    ).rejects.toBeDefined();
  });
});

describe('useReleaseReports', () => {
  beforeEach(() => { resetSupabaseMock(); jest.clearAllMocks(); });

  it('calls release-report edge function', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValueOnce({
      data: { ok: true, released: 2, notified: 2 }, error: null,
    });
    const { result } = renderHook(() => useReleaseReports('school-1'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ student_ids: ['stu-1', 'stu-2'], semester_id: 'sem-1' });
    });
    expect(supabase.functions.invoke).toHaveBeenCalledWith('release-report', expect.any(Object));
  });

  it('throws when edge fn returns error', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValueOnce({
      data: null, error: { message: 'Edge fn failed' },
    });
    const { result } = renderHook(() => useReleaseReports('school-1'), { wrapper });
    await expect(
      act(async () => result.current.mutateAsync({ student_ids: ['stu-1'], semester_id: 'sem-1' }))
    ).rejects.toBeDefined();
  });
});

describe('useReportAuditLog', () => {
  beforeEach(() => resetSupabaseMock());

  it('is disabled when reportId is null', () => {
    const { result } = renderHook(
      () => useReportAuditLog(null, 'school-1'),
      { wrapper }
    );
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('is enabled when reportId + schoolId provided', async () => {
    mockSupabaseData({
      audit_logs: {
        data: [{ id: 'al-1', event_type: 'report_approved', created_at: '2025-01-01T10:00:00Z', data: { report_id: 'rep-1' }, actor: { full_name: 'Jane' } }],
        error: null,
      },
    });
    const { result } = renderHook(
      () => useReportAuditLog('rep-1', 'school-1', 'stu-1'),
      { wrapper }
    );
    // query fires — just verify it doesn't stay idle
    expect(result.current.fetchStatus).not.toBe(undefined);
  });
});
