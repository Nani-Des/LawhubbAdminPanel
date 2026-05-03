import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { effectiveCountryCode } from '../constants/countries';

const PORTAL_STORAGE_KEY = 'lawhubb_login_portal';
/** Persists across reloads so we know whether to restore admin or member workspace session */
const SESSION_KIND_KEY = 'lawhubb_session_kind';
/** Obsolete bulk-import keys; if left in sessionStorage they used to make auth callback exit early. */
const LEGACY_BULK_IMPORT = 'bulkImportInProgress';
const LEGACY_EXPECTED_ADMIN_UID = 'expectedAdminUid';

export type LoginPortal = 'admin' | 'doctor';

interface AdminSession {
  kind: 'admin';
  uid: string;
  baseRole: 'chamber_admin' | 'chamber_manager' | 'main_admin' | 'hospital_admin' | 'hospital_manager';
  chamberId?: string;
  chamberName?: string;
  hospitalId?: string;
  hospitalName?: string;
  permissions?: string[] | { [key: string]: boolean };
  name?: string;
  /** ISO 3166-1 alpha-2; missing profile field defaults to GH for legacy users */
  countryCode: string;
}

interface DoctorSession {
  kind: 'doctor';
  uid: string;
  name?: string;
  chamberId?: string;
  chamberName?: string;
  /** ISO 3166-1 alpha-2; missing profile field defaults to GH for legacy users */
  countryCode: string;
}

export type AppSession = AdminSession | DoctorSession;

interface AuthContextType {
  currentAdmin: AdminSession | null;
  currentDoctor: DoctorSession | null;
  session: AppSession | null;
  isAuthenticated: boolean;
  login: (email: string, password: string, portal: LoginPortal) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function resolveChamberIdFromUser(userData: Record<string, unknown>): string | undefined {
  const raw =
    userData.chamberId ??
    userData.hospitalId ??
    userData['Hospital ID'] ??
    userData['Chamber ID'];
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

function readBaseRole(userData: Record<string, unknown>): unknown {
  return userData.baseRole ?? userData.BaseRole ?? userData['Base Role'];
}

function isTruthyFlag(v: unknown): boolean {
  return v === true || v === 1;
}

function isDoctorRoleAndStatus(userData: Record<string, unknown>): boolean {
  return isTruthyFlag(userData.Role) && isTruthyFlag(userData.Status);
}

function isAdminBaseRole(br: unknown, adminRoles: readonly string[]): boolean {
  if (typeof br !== 'string' || !br.trim()) return false;
  const trimmed = br.trim();
  const normalized = trimmed.toLowerCase().replace(/[\s-]+/g, '_');
  return adminRoles.some((r) => r === trimmed || r === normalized);
}

/** Auth user uid is usually the Firestore doc id, but legacy data may use another id + User ID / Email. */
async function fetchUsersProfile(user: User): Promise<Record<string, unknown> | null> {
  const uidRef = await getDoc(doc(db, 'Users', user.uid));
  if (uidRef.exists()) {
    return uidRef.data() as Record<string, unknown>;
  }

  const tryUserIdField = query(
    collection(db, 'Users'),
    where('User ID', '==', user.uid),
    limit(1)
  );
  const byUserId = await getDocs(tryUserIdField);
  if (!byUserId.empty) {
    return byUserId.docs[0].data() as Record<string, unknown>;
  }

  const email = user.email?.trim();
  if (email) {
    for (const em of [email, email.toLowerCase()]) {
      const byEmail = query(collection(db, 'Users'), where('Email', '==', em), limit(1));
      const emailSnap = await getDocs(byEmail);
      if (!emailSnap.empty) {
        return emailSnap.docs[0].data() as Record<string, unknown>;
      }
    }
  }

  return null;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentAdmin, setCurrentAdmin] = useState<AdminSession | null>(null);
  const [currentDoctor, setCurrentDoctor] = useState<DoctorSession | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setCurrentAdmin(null);
        setCurrentDoctor(null);
        setIsAuthenticated(false);
        return;
      }

      sessionStorage.removeItem(LEGACY_BULK_IMPORT);
      sessionStorage.removeItem(LEGACY_EXPECTED_ADMIN_UID);

      const portalFromLogin = sessionStorage.getItem(PORTAL_STORAGE_KEY) as LoginPortal | null;
      const persistedKind = sessionStorage.getItem(SESSION_KIND_KEY) as LoginPortal | null;
      let portal: LoginPortal | null =
        portalFromLogin || (persistedKind === 'doctor' || persistedKind === 'admin' ? persistedKind : null);

      const userData = await fetchUsersProfile(user);

      if (!userData) {
        await signOut(auth);
        sessionStorage.removeItem(PORTAL_STORAGE_KEY);
        sessionStorage.removeItem(SESSION_KIND_KEY);
        return;
      }

      const adminRoles = [
        'hospital_admin',
        'hospital_manager',
        'chamber_admin',
        'chamber_manager',
        'main_admin',
      ] as const;
      if (!portal) {
        const brEarly = readBaseRole(userData);
        if (isAdminBaseRole(brEarly, adminRoles)) {
          portal = 'admin';
        } else if (isDoctorRoleAndStatus(userData)) {
          portal = 'doctor';
        }
      }
      const userName =
        userData.Fname && userData.Lname
          ? `${userData.Fname} ${userData.Lname}`
          : (userData.name as string) || user.displayName || undefined;

      const fetchChamberName = async (chamberId: string | undefined) => {
        if (!chamberId) return undefined;
        const chamberRef = doc(db, 'Chamber', chamberId);
        const chamberSnap = await getDoc(chamberRef);
        if (!chamberSnap.exists()) return undefined;
        const chamberData = chamberSnap.data();
        return (chamberData['Chamber Name'] || chamberData.name) as string | undefined;
      };

      if (portal === 'doctor') {
        const roleOk = isTruthyFlag(userData.Role);
        const statusOk = isTruthyFlag(userData.Status);
        if (!roleOk || !statusOk) {
          await signOut(auth);
          sessionStorage.removeItem(PORTAL_STORAGE_KEY);
          sessionStorage.removeItem(SESSION_KIND_KEY);
          return;
        }

        const chamberId = resolveChamberIdFromUser(userData);
        const chamberName = await fetchChamberName(chamberId);
        const countryCode = effectiveCountryCode(userData as Record<string, unknown>);

        setCurrentAdmin(null);
        setCurrentDoctor({
          kind: 'doctor',
          uid: user.uid,
          name: userName,
          chamberId,
          chamberName,
          countryCode,
        });
        setIsAuthenticated(true);
        sessionStorage.setItem(SESSION_KIND_KEY, 'doctor');
        sessionStorage.removeItem(PORTAL_STORAGE_KEY);
        return;
      }

      if (portal === 'admin') {
        const brRaw = readBaseRole(userData);
        if (!isAdminBaseRole(brRaw, adminRoles)) {
          await signOut(auth);
          sessionStorage.removeItem(PORTAL_STORAGE_KEY);
          sessionStorage.removeItem(SESSION_KIND_KEY);
          return;
        }

        const trimmed = typeof brRaw === 'string' ? brRaw.trim() : '';
        const normalizedRole = trimmed.toLowerCase().replace(/[\s-]+/g, '_');
        const brCanonical = adminRoles.find((r) => r === trimmed || r === normalizedRole);
        if (!brCanonical) {
          await signOut(auth);
          sessionStorage.removeItem(PORTAL_STORAGE_KEY);
          sessionStorage.removeItem(SESSION_KIND_KEY);
          return;
        }

        const chamberId = resolveChamberIdFromUser(userData);
        let chamberName: string | undefined;
        let hospitalName: string | undefined;
        const resolvedChamberId = chamberId;
        if (resolvedChamberId && brCanonical !== 'main_admin') {
          const chamberRef = doc(db, 'Chamber', resolvedChamberId);
          const chamberSnap = await getDoc(chamberRef);
          if (chamberSnap.exists()) {
            const chamberData = chamberSnap.data();
            const nm = (chamberData['Chamber Name'] ?? chamberData.name) as string | undefined;
            chamberName = nm;
            hospitalName = nm;
          }
        }

        const countryCode = effectiveCountryCode(userData as Record<string, unknown>);

        setCurrentDoctor(null);
        setCurrentAdmin({
          kind: 'admin',
          uid: user.uid,
          baseRole: brCanonical as AdminSession['baseRole'],
          chamberId: (userData.chamberId || userData.hospitalId) as string | undefined,
          chamberName,
          hospitalId: (userData.hospitalId || userData.chamberId) as string | undefined,
          hospitalName,
          permissions: (userData.Permissions || userData.permissions) as AdminSession['permissions'],
          name: userName,
          countryCode,
        });
        setIsAuthenticated(true);
        sessionStorage.setItem(SESSION_KIND_KEY, 'admin');
        sessionStorage.removeItem(PORTAL_STORAGE_KEY);
        return;
      }

      await signOut(auth);
      sessionStorage.removeItem(PORTAL_STORAGE_KEY);
      sessionStorage.removeItem(SESSION_KIND_KEY);
    }, (error) => {
      console.error('Auth state change error:', error);
    });

    return () => unsub();
  }, []);

  const login = async (email: string, password: string, portal: LoginPortal): Promise<boolean> => {
    try {
      sessionStorage.setItem(PORTAL_STORAGE_KEY, portal);
      await signInWithEmailAndPassword(auth, email.trim(), password);
      return true;
    } catch (err) {
      console.error('Login failed:', err);
      sessionStorage.removeItem(PORTAL_STORAGE_KEY);
      return false;
    }
  };

  const logout = async () => {
    sessionStorage.removeItem(PORTAL_STORAGE_KEY);
    sessionStorage.removeItem(SESSION_KIND_KEY);
    await signOut(auth);
    setCurrentAdmin(null);
    setCurrentDoctor(null);
    setIsAuthenticated(false);
  };

  const session: AppSession | null = currentAdmin ?? currentDoctor ?? null;

  return (
    <AuthContext.Provider
      value={{
        currentAdmin,
        currentDoctor,
        session,
        isAuthenticated,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
