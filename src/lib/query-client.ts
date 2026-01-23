import { QueryClient } from "@tanstack/react-query";

// Shared query client instance - accessible throughout the app
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false, // Prevent unnecessary refetches
    },
  },
});

// User-specific localStorage keys that should be cleared on logout
const USER_SPECIFIC_STORAGE_KEYS = [
  'unitPref_glucose',
  'unitPref_weight', 
  'unitPref_temperature',
  'unitPreferences',
  'marpe_unit_preferences',
  'lastSelectedFamilyMember',
  'dashboardPreferences',
  'theme', // Reset theme to system on logout
] as const;

/**
 * Clears all user-specific data from caches and storage.
 * Should be called on sign-out to prevent data leakage between users.
 */
export function clearAllUserData(): void {
  // Clear React Query cache completely - removes ALL cached queries
  queryClient.clear();
  
  // Also reset query client to ensure no stale observers
  queryClient.resetQueries();
  
  // Clear user-specific localStorage items
  USER_SPECIFIC_STORAGE_KEYS.forEach(key => {
    localStorage.removeItem(key);
  });
  
  // Clear any session storage
  sessionStorage.clear();
  
  console.log('[Auth] Cleared all user-specific data from caches and storage');
}

/**
 * Invalidates all queries - useful when user changes but doesn't fully log out
 * (e.g., switching between family member views)
 */
export function invalidateAllQueries(): void {
  queryClient.invalidateQueries();
}
