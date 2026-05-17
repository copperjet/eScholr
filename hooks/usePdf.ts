/**
 * Unified PDF lifecycle hooks for every doc type.
 *
 *   useEnqueuePdf(docType)  → mutation: call enqueue_pdf RPC, returns job id
 *   usePdfStatus(docType, docId, enabled?) → polls pdf_jobs + parent
 *
 * Status polling auto-stops on terminal states (success/failed).
 * Callers should invalidate parent queries on success.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export type DocType = 'report' | 'invoice' | 'receipt' | 'transcript';

export type PdfStatus = 'none' | 'queued' | 'generating' | 'success' | 'failed';

interface EnqueueArgs {
  docId:    string;
  priority?: number;
  isPreview?: boolean;
  payload?:  Record<string, unknown>;
}

export function useEnqueuePdf(docType: DocType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ docId, priority = 5, isPreview = false, payload = {} }: EnqueueArgs) => {
      const { data, error } = await (supabase as any).rpc('enqueue_pdf', {
        p_doc_type:   docType,
        p_doc_id:     docId,
        p_priority:   priority,
        p_is_preview: isPreview,
        p_payload:    payload,
      });
      if (error) throw error;
      return data as string; // job id
    },
    onSuccess: (_jobId, vars) => {
      qc.invalidateQueries({ queryKey: ['pdf-status', docType, vars.docId] });
    },
  });
}

export interface PdfStatusSnapshot {
  jobId:    string | null;
  status:   PdfStatus;
  attempts: number;
  lastError: string | null;
  pdfUrl:   string | null;
  versionNumber: number | null;
}

const PARENT_TABLE: Record<DocType, string> = {
  report:     'reports',
  invoice:    'invoices',
  receipt:    'finance_records',
  transcript: 'transcripts',
};

const POLL_MS = 3000;

export function usePdfStatus(docType: DocType, docId: string, enabled = true) {
  return useQuery<PdfStatusSnapshot>({
    queryKey: ['pdf-status', docType, docId],
    enabled: enabled && !!docId,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === 'queued' || s === 'generating' ? POLL_MS : false;
    },
    queryFn: async () => {
      const [jobRes, parentRes, versionRes] = await Promise.all([
        (supabase as any)
          .from('pdf_jobs')
          .select('id, status, attempts, last_error')
          .eq('doc_type', docType)
          .eq('doc_id', docId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        (supabase as any)
          .from(PARENT_TABLE[docType])
          .select('pdf_url, pdf_status, pdf_error')
          .eq('id', docId)
          .maybeSingle(),
        (supabase as any)
          .from('pdf_versions')
          .select('version_number, pdf_url')
          .eq('doc_type', docType)
          .eq('doc_id', docId)
          .eq('is_current', true)
          .maybeSingle(),
      ]);

      const job    = jobRes.data;
      const parent = parentRes.data;
      const ver    = versionRes.data;

      // Prefer the parent table's pdf_status (it's the source of truth
      // the rest of the app reads); fall back to the job row.
      const status: PdfStatus =
        (parent?.pdf_status as PdfStatus | undefined) ??
        (job?.status as PdfStatus | undefined) ??
        'none';

      return {
        jobId:         job?.id ?? null,
        status,
        attempts:      job?.attempts ?? 0,
        lastError:     parent?.pdf_error ?? job?.last_error ?? null,
        pdfUrl:        ver?.pdf_url ?? parent?.pdf_url ?? null,
        versionNumber: ver?.version_number ?? null,
      };
    },
  });
}

/** True while there is active work for this doc. */
export function isInFlight(s: PdfStatus | undefined): boolean {
  return s === 'queued' || s === 'generating';
}
