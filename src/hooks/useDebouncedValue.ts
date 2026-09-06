import { useEffect, useState } from 'react';

/**
 * A value that settles before anything acts on it.
 *
 * For a search box whose query goes to the server: without this, every
 * keystroke is its own request, the results flicker through partial matches,
 * and a five-letter search costs five round trips of whatever the query costs.
 */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
