import { useRef } from 'react';
import { TextInput } from 'react-native';

/**
 * Manages focus order across a set of text inputs so the keyboard "next"
 * key advances to the following field.
 *
 * const chain = useFocusChain(3);
 * <FormField ref={chain.ref(0)} returnKeyType="next" onSubmitEditing={chain.focusNext(0)} />
 */
export function useFocusChain(count: number) {
  const refs = useRef<(TextInput | null)[]>(Array(count).fill(null));

  const ref = (index: number) => (node: TextInput | null) => {
    refs.current[index] = node;
  };

  const focusNext = (index: number) => () => {
    refs.current[index + 1]?.focus();
  };

  const focus = (index: number) => {
    refs.current[index]?.focus();
  };

  return { ref, focusNext, focus };
}
