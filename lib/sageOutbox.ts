/**
 * sageOutbox — enqueue finance events for Sage export.
 * Called from mutation hooks after successful DB writes.
 * Idempotency key: school_id:entity_table:entity_id:event_type
 * Duplicate keys silently ignored (ON CONFLICT DO NOTHING in trigger).
 * App-side enqueue is a safety net; DB triggers are primary.
 */
import { supabase } from './supabase';

export type SageEventType =
  | 'invoice_created'
  | 'invoice_cancelled'
  | 'invoice_status_changed'
  | 'payment_recorded';

export async function enqueueSageEvent(params: {
  schoolId: string;
  eventType: SageEventType;
  entityTable: string;
  entityId: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const key = `${params.schoolId}:${params.entityTable}:${params.entityId}:${params.eventType}`;
  await (supabase as any).from('sage_sync_queue').insert({
    school_id:       params.schoolId,
    event_type:      params.eventType,
    entity_table:    params.entityTable,
    entity_id:       params.entityId,
    payload:         params.payload,
    idempotency_key: key,
  });
  // Ignore errors (duplicate key = already queued, network = retry on next export)
}
