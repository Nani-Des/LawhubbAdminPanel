import React, { createContext, useContext, useEffect, useState } from 'react';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

interface AdminSession {
  uid: string;
  baseRole: 'chamber_admin' | 'chamber_manager' | 'main_admin' | 'hospital_admin' | 'hospital_manager'; // Keep old roles for backward compatibility
  chamberId?: string; // Optional for main_admin
  chamberName?: string;
  hospitalId?: string; // Keep for backward compatibility
  hospitalName?: string; // Keep for backward compatibility
  permissions?: string[] | { [key: string]: boolean };
  name?: string; // User's name from Users collection
}

interface AuthContextType {
  currentAdmin: AdminSession | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentAdmin, setCurrentAdmin] = useState<AdminSession | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setCurrentAdmin(null);
        setIsAuthenticated(false);
        return;
      }

      // Check if we're in the middle of a bulk import operation
      const isBulkImporting = sessionStorage.getItem('bulkImportInProgress') === 'true';
      const expectedAdminUid = sessionStorage.getItem('expectedAdminUid');

      // During bulk import, if the current user is not the expected admin,
      // it means a new user was just created. Skip the role check to prevent logout.
      // The bulk import function will handle signing out after completion.
      if (isBulkImporting && expectedAdminUid && user.uid !== expectedAdminUid) {
        // This is a newly created user during bulk import
        // Skip processing to prevent logout during bulk import
        return;
      }

      const userRef = doc(db, 'Users', user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        await signOut(auth);
        return;
      }

      const userData = userSnap.data();

      if (
        userData.baseRole !== 'hospital_admin' &&
        userData.baseRole !== 'hospital_manager' &&
        userData.baseRole !== 'chamber_admin' &&
        userData.baseRole !== 'chamber_manager' &&
        userData.baseRole !== 'main_admin'
      ) {
        await signOut(auth);
        return;
      }

      let chamberName: string | undefined;
      let hospitalName: string | undefined; // For backward compatibility

      // Fetch chamber name if user has a chamberId (backward compatible with hospitalId)
      const chamberId = userData.chamberId || userData.hospitalId;
      if (chamberId && userData.baseRole !== 'main_admin') {
        const chamberRef = doc(db, 'Chamber', chamberId);
        const chamberSnap = await getDoc(chamberRef);
        if (chamberSnap.exists()) {
          const chamberData = chamberSnap.data();
          chamberName = chamberData['Chamber Name'] || chamberData.name;
          hospitalName = chamberName; // Backward compatibility
        }
      }

      // Get user's name from userData
      const userName = userData.Fname && userData.Lname 
        ? `${userData.Fname} ${userData.Lname}`
        : userData.name || user.displayName || undefined;

      setCurrentAdmin({
        uid: user.uid,
        baseRole: userData.baseRole,
        chamberId: userData.chamberId || userData.hospitalId, // Support both
        chamberName,
        hospitalId: userData.hospitalId || userData.chamberId, // Backward compatibility
        hospitalName,
        permissions: userData.Permissions || userData.permissions || [],
        name: userName,
      });

      setIsAuthenticated(true);
    }, (error) => {
      // Handle auth state change errors gracefully
      console.error('Auth state change error:', error);
    });

    return () => unsub();
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return true; // role validation happens in listener
    } catch (err) {
      console.error('Login failed:', err);
      return false;
    }
  };

  const logout = async () => {
    await signOut(auth);
    setCurrentAdmin(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ currentAdmin, isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
