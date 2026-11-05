'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

export interface AuthUser {
  id: number;
  username: string;
  role: string;
  tenant_id?: number | null;
  storeIds?: number[];
  [key: string]: any;
}

export interface AuthStore {
  id: number;
  store_name: string;
  [key: string]: any;
}

export interface AuthContextType {
  user: AuthUser | null;
  stores: AuthStore[];
  activeStoreId: number | 'manager' | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
  setActiveStoreId: React.Dispatch<React.SetStateAction<number | 'manager' | null>>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  stores: [],
  activeStoreId: null,
  loading: true,
  refreshUser: async () => {},
  logout: async () => {},
  setActiveStoreId: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [stores, setStores] = useState<AuthStore[]>([]);
  const [activeStoreId, setActiveStoreId] = useState<number | 'manager' | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.user) {
        setUser(data.user);
        if (data.stores) setStores(data.stores);
        if (data.activeStoreId !== undefined) setActiveStoreId(data.activeStoreId);
      } else {
        setUser(null);
        setStores([]);
        setActiveStoreId(null);
      }
    } catch (err) {
      console.error('Auth check error:', err);
      setUser(null);
      setStores([]);
      setActiveStoreId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();

    // 既存のイベント互換（他の画面やスクリプトが roleChange を dispatch した場合にも同期）
    window.addEventListener('roleChange', fetchUser);
    return () => window.removeEventListener('roleChange', fetchUser);
  }, [fetchUser]);

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
      setStores([]);
      setActiveStoreId(null);
      window.dispatchEvent(new Event('roleChange'));
      router.push('/login');
    } catch (e) {
      console.error('Logout error:', e);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        stores,
        activeStoreId,
        loading,
        refreshUser: fetchUser,
        logout,
        setActiveStoreId,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
