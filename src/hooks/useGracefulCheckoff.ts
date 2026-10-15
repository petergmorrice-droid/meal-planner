import { useState, useRef, useEffect, useCallback } from 'react';

export function useGracefulCheckoff(
  initialChecked: boolean,
  onCommit: (checked: boolean) => void,
  delay: number = 2500
) {
  const [optimisticChecked, setOptimisticChecked] = useState(initialChecked);
  const [isPending, setIsPending] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync with external state if it changes and we aren't pending
  useEffect(() => {
    if (!isPending) {
      setOptimisticChecked(initialChecked);
    }
  }, [initialChecked, isPending]);

  const toggle = useCallback(() => {
    const newValue = !optimisticChecked;
    setOptimisticChecked(newValue);
    setIsPending(true);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      setIsPending(false);
      onCommit(newValue);
    }, delay);
  }, [optimisticChecked, onCommit, delay]);

  const undo = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsPending(false);
    setOptimisticChecked(initialChecked);
  }, [initialChecked]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { checked: optimisticChecked, isPending, toggle, undo };
}
