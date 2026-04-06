import React, { createContext, useContext, useEffect, useState } from 'react';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

const PORTAL_STORAGE_KEY = 'lawhubb_login_portal';
/** Persists across reloads so we know whether to restore admin or lawyer/doctor session */
const SESSION_KIND_KEY = 'lawhubb_session_kind';

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
}

interface DoctorSession {
  kind: 'doctor';
  uid: string;
  name?: string;
  chamberId?: string;
  chamberName?: string;
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

      const isBulkImporting = sessionStorage.getItem('bulkImportInProgress') === 'true';
      const expectedAdminUid = sessionStorage.getItem('expectedAdminUid');

      if (isBulkImporting && expectedAdminUid && user.uid !== expectedAdminUid) {
        return;
      }

      const portalFromLogin = sessionStorage.getItem(PORTAL_STORAGE_KEY) as LoginPortal | null;
      const persistedKind = sessionStorage.getItem(SESSION_KIND_KEY) as LoginPortal | null;
      let portal: LoginPortal | null =
        portalFromLogin || (persistedKind === 'doctor' || persistedKind === 'admin' ? persistedKind : null);

      const userRef = doc(db, 'Users', user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        await signOut(auth);
        sessionStorage.removeItem(PORTAL_STORAGE_KEY);
        sessionStorage.removeItem(SESSION_KIND_KEY);
        return;
      }

      const userData = userSnap.data() as Record<string, unknown>;

      const adminRoles = [
        'hospital_admin',
        'hospital_manager',
        'chamber_admin',
        'chamber_manager',
        'main_admin',
      ];
      if (!portal) {
        const brEarly = userData.baseRole;
        if (typeof brEarly === 'string' && adminRoles.includes(brEarly)) {
          portal = 'admin';
        } else if (userData.Role === true && userData.Status === true) {
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
        const roleOk = userData.Role === true;
        const statusOk = userData.Status === true;
        if (!roleOk || !statusOk) {
          await signOut(auth);
          sessionStorage.removeItem(PORTAL_STORAGE_KEY);
          sessionStorage.removeItem(SESSION_KIND_KEY);
          return;
        }

        const chamberId = resolveChamberIdFromUser(userData);
        const chamberName = await fetchChamberName(chamberId);

        setCurrentAdmin(null);
        setCurrentDoctor({
          kind: 'doctor',
          uid: user.uid,
          name: userName,
          chamberId,
          chamberName,
        });
        setIsAuthenticated(true);
        sessionStorage.setItem(SESSION_KIND_KEY, 'doctor');
        sessionStorage.removeItem(PORTAL_STORAGE_KEY);
        return;
      }

      if (portal === 'admin') {
        const br = userData.baseRole;
        if (typeof br !== 'string' || !adminRoles.includes(br)) {
          await signOut(auth);
          sessionStorage.removeItem(PORTAL_STORAGE_KEY);
          sessionStorage.removeItem(SESSION_KIND_KEY);
          return;
        }

        const chamberId = resolveChamberIdFromUser(userData);
        let chamberName: string | undefined;
        let hospitalName: string | undefined;
        const resolvedChamberId = chamberId;
        if (resolvedChamberId && br !== 'main_admin') {
          const chamberRef = doc(db, 'Chamber', resolvedChamberId);
          const chamberSnap = await getDoc(chamberRef);
          if (chamberSnap.exists()) {
            const chamberData = chamberSnap.data();
            const nm = (chamberData['Chamber Name'] ?? chamberData.name) as string | undefined;
            chamberName = nm;
            hospitalName = nm;
          }
        }

        setCurrentDoctor(null);
        setCurrentAdmin({
          kind: 'admin',
          uid: user.uid,
          baseRole: br as AdminSession['baseRole'],
          chamberId: (userData.chamberId || userData.hospitalId) as string | undefined,
          chamberName,
          hospitalId: (userData.hospitalId || userData.chamberId) as string | undefined,
          hospitalName,
          permissions: (userData.Permissions || userData.permissions) as AdminSession['permissions'],
          name: userName,
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
      await signInWithEmailAndPassword(auth, email, password);
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
