import { useCallback, useState } from "react";

/**
 * Custom hook for handling async actions (API calls) with built-in spam prevention
 * Provides loading state and automatic button disabling during request
 *
 * @param asyncFn - The async function to execute
 * @param onSuccess - Optional callback on successful completion
 * @param onError - Optional callback on error
 * @returns { isLoading, execute, error }
 *
 * Usage:
 * const { isLoading, execute, error } = useAsyncAction(
 *   async () => await fetch('/api/endpoint'),
 *   () => showSuccessToast(),
 *   (error) => showErrorToast(error)
 * );
 *
 * <button onClick={() => execute()} disabled={isLoading}>
 *   {isLoading ? "Saving..." : "Save"}
 * </button>
 */
export function useAsyncAction<T>(
  asyncFn: () => Promise<T>,
  onSuccess?: (result: T) => void,
  onError?: (error: Error) => void,
) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(async () => {
    // Prevent execution if already loading
    if (isLoading) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await asyncFn();
      onSuccess?.(result);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      onError?.(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [asyncFn, isLoading, onSuccess, onError]);

  return { isLoading, execute, error };
}
