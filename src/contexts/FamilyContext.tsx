import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useFamilyMembers, FamilyMember } from '@/hooks/useFamilyMembers';

interface FamilyContextValue {
  /** null = the signed-in user ("Myself"); otherwise a family_member.id */
  activeMemberId: string | null;
  activeMember: FamilyMember | null;
  setActiveMemberId: (id: string | null) => void;
  familyMembers: FamilyMember[];
  isLoading: boolean;
}

const FamilyContext = createContext<FamilyContextValue | undefined>(undefined);

const STORAGE_KEY = 'onecare.activeFamilyMemberId';

export function FamilyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { familyMembers, isLoading } = useFamilyMembers();
  const [activeMemberId, setActiveMemberIdState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(STORAGE_KEY) || null;
  });

  // Reset on user change
  useEffect(() => {
    if (!user) {
      setActiveMemberIdState(null);
      if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [user?.id]);

  // Drop stale id if member no longer exists
  useEffect(() => {
    if (!activeMemberId || isLoading) return;
    const exists = familyMembers.some((m) => m.id === activeMemberId && m.is_active);
    if (!exists) {
      setActiveMemberIdState(null);
      if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [familyMembers, activeMemberId, isLoading]);

  const setActiveMemberId = (id: string | null) => {
    setActiveMemberIdState(id);
    if (typeof window === 'undefined') return;
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  };

  const activeMember = activeMemberId
    ? familyMembers.find((m) => m.id === activeMemberId) || null
    : null;

  return (
    <FamilyContext.Provider
      value={{ activeMemberId, activeMember, setActiveMemberId, familyMembers, isLoading }}
    >
      {children}
    </FamilyContext.Provider>
  );
}

export function useActiveFamilyMember() {
  const ctx = useContext(FamilyContext);
  if (!ctx) {
    // Safe default outside the provider (e.g. guest pages)
    return {
      activeMemberId: null,
      activeMember: null,
      setActiveMemberId: () => {},
      familyMembers: [],
      isLoading: false,
    } as FamilyContextValue;
  }
  return ctx;
}
