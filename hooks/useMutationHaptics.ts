import { useEffect, useRef } from 'react';
import { haptics } from '../lib/haptics';

interface MutationLike {
  status: 'idle' | 'pending' | 'success' | 'error';
}

/**
 * Fires a success/error haptic whenever a React Query mutation settles.
 *
 * const save = useSaveStudent();
 * useMutationHaptics(save);
 */
export function useMutationHaptics(mutation: MutationLike) {
  const prev = useRef(mutation.status);

  useEffect(() => {
    if (prev.current === mutation.status) return;
    prev.current = mutation.status;
    if (mutation.status === 'success') haptics.success();
    else if (mutation.status === 'error') haptics.error();
  }, [mutation.status]);
}
