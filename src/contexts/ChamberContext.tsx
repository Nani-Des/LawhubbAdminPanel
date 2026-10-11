import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  Chamber,
  Practice,
  Users,
  MedicalRecord,
  Service,
  Referral,
  Notification,
  Metrics,
} from '../types';
import {
  collection,
  query,
  where,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  setDoc,
  getDoc,
  Timestamp,
  documentId,
  arrayUnion,
  arrayRemove,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';

interface ChamberContextType {
  chamber: Chamber | null;
  practices: Practice[];
  users: Users[];
  medicalRecords: MedicalRecord[];
  services: Service[];
  referrals: Referral[];
  notifications: Notification[];
  metrics: Metrics | null;
  addPractice: (data: string | Practice) => Promise<void>;
  updatePractice: (practice: Practice) => Promise<void>;
  deletePractice: (practiceId: string) => Promise<void>;
  addUser: (user: Omit<Users, 'id'>, authUid: string) => Promise<string | undefined>;
  updateUser: (user: Users) => Promise<void>;
  toggleUserStatus: (userId: string) => Promise<void>;
  // addMedicalRecord: (record: Omit<MedicalRecord, 'id' | 'chamberId' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  // updateMedicalRecord: (record: MedicalRecord) => Promise<void>;
  // updateReferralStatus: (referralId: string, status: 'accepted' | 'declined') => Promise<void>;
  markNotificationAsRead: (notificationId: string) => Promise<void>;
  setSelectedChamberId?: (chamberId: string) => void; // For main_admin to switch chambers
  loading: boolean;
  error: string | null;
}

const ChamberContext = createContext<ChamberContextType | undefined>(undefined);

export const ChamberProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentAdmin, currentDoctor } = useAuth();
  const [chamber, setChamber] = useState<Chamber | null>(null);
  const [chamberPractices, setChamberPractices] = useState<Practice[]>([]);
  const [chamberUsers, setChamberUsers] = useState<Users[]>([]);
  const [chamberRecords, setChamberRecords] = useState<MedicalRecord[]>([]);
  const [chamberServices, setChamberServices] = useState<Service[]>([]);
  const [chamberReferrals, setChamberReferrals] = useState<Referral[]>([]);
  const [chamberNotifications, setChamberNotifications] = useState<Notification[]>([]);
  const [chamberMetrics, setChamberMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedChamberId, setSelectedChamberIdState] = useState<string | null>(null);

  // Function to set selected chamber ID (for main_admin)
  const setSelectedChamberId = (chamberId: string) => {
    setSelectedChamberIdState(chamberId);
  };

  // 1. Fetch chamber + general collections
  useEffect(() => {
      if (!currentAdmin && !currentDoctor) {
        setLoading(true);
        return;
      }
    
    // For main_admin, use selectedChamberId if set, otherwise show selection page
    // For member workspace (web portal), use chamber on their user profile
    // For other admin roles, use currentAdmin.chamberId (or hospitalId for backward compatibility)
    let chamberId: string | undefined;

    if (currentDoctor) {
      chamberId = currentDoctor.chamberId;
    } else if (currentAdmin!.baseRole === 'main_admin') {
      chamberId = selectedChamberId || undefined;
      // If main_admin but no chamber selected, don't load chamber data
      if (!selectedChamberId) {
        setChamber(null);
        setChamberPractices([]);
        setChamberUsers([]);
        setChamberRecords([]);
        setChamberServices([]);
        setChamberReferrals([]);
        setChamberNotifications([]);
        setChamberMetrics(null);
        setLoading(false);
        return;
      }
    } else {
      chamberId = currentAdmin!.chamberId || currentAdmin!.hospitalId;
    }

    if (!chamberId) {
      console.warn('No chamberId on profile');
      setLoading(false);
      setChamber(null);
      setChamberPractices([]);
      setChamberUsers([]);
      setChamberRecords([]);
      setChamberServices([]);
      setChamberReferrals([]);
      setChamberNotifications([]);
      setChamberMetrics(null);
      setLoading(false);
      return;
    }
    console.log('Fetching chamber:', chamberId);

    const unsubChamber = onSnapshot(
      doc(db, 'Chamber', chamberId),
      (docSnap) => {
        if (docSnap.exists()) {
          setChamber({ id: docSnap.id, ...docSnap.data() } as Chamber);
          setError(null);
        } else {
          console.warn('Chamber not found:', chamberId);
          setChamber(null);
          setError('Chamber not found');
        }
        setLoading(false);
      },
      (err) => {
        console.error('Chamber fetch error:', err);
        setError('Failed to load chamber');
        setLoading(false);
      }
    );

    const fetchCollection = (colName: string, setter: Function, filters: any[] = []) => {
      const colRef = collection(db, colName);
      const q = filters.length > 0 ? query(colRef, ...filters) : query(colRef);
      return onSnapshot(
        q,
        (querySnap) => {
          const items = querySnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          setter(items);
        },
        (err) => {
          console.error(`${colName} fetch error:`, err);
          setError(`Failed to load ${colName.toLowerCase()}`);
        }
      );
    };

    const chamberFilter = where('Chamber ID', '==', chamberId);

    const unsubUsers = fetchCollection('Users', setChamberUsers, [chamberFilter, where('Role', '==', true)]);
    const unsubRecords = fetchCollection('medicalRecords', setChamberRecords, [chamberFilter]);
    const unsubServices = fetchCollection('Services', setChamberServices, [chamberFilter]);
    const unsubReferrals = fetchCollection('Referrals', setChamberReferrals, [chamberFilter]);
    const unsubNotifications = fetchCollection('notifications', setChamberNotifications, [chamberFilter]);

    return () => {
      unsubChamber();
      unsubUsers();
      unsubRecords();
      unsubServices();
      unsubReferrals();
      unsubNotifications();
    };
  }, [currentAdmin, currentDoctor, selectedChamberId]);

  // 2. Fetch practices after chamber is loaded
  useEffect(() => {
    if (!chamber) {
      setChamberPractices([]);
      return;
    }

    // Validate practiceIds
    const practiceIds = (chamber['Chamber Practice'] || [])
      .filter((id: any) => typeof id === 'string')
      .map((id: string) => id);
    console.log('Practice IDs:', practiceIds);

    if (!practiceIds.length) {
      console.log('No practice IDs found');
      setChamberPractices([]);
      return;
    }

    const fetchCollectionWithChunks = (colName: string, setter: Function, ids: string[]) => {
      const colRef = collection(db, colName);
      const chunks: string[][] = [];
      const unsubscribers: (() => void)[] = [];

      for (let i = 0; i < ids.length; i += 10) {
        chunks.push(ids.slice(i, i + 10));
      }

      chunks.forEach((chunk) => {
        const q = query(colRef, where(documentId(), 'in', chunk));
        const unsub = onSnapshot(
          q,
          (querySnap) => {
            const chunkItems = querySnap.docs.map((doc) => ({
              id: doc.id,
              'Practice ID': doc.id,
              'Practice Name': doc.data()['Practice Name'] || '',
            }));
            setter((prev: Practice[]) => {
              const filtered = prev.filter((d) => !chunk.includes(d.id));
              return [...filtered, ...chunkItems];
            });
          },
          (err) => {
            console.error('Practice fetch error:', err);
            setError('Failed to load Practice Areas');
          }
        );
        unsubscribers.push(unsub);
      });

      return () => unsubscribers.forEach((unsub) => unsub());
    };

    setChamberPractices([]); // Clear state
    const unsubPractices = fetchCollectionWithChunks('Practice', setChamberPractices, practiceIds);

    return () => {
      if (unsubPractices) unsubPractices();
    };
  }, [chamber]);

  // Practice functions
  const addPractice = async (data: string | Practice) => {
    if (!currentAdmin || !chamber) {
      console.warn('Cannot add practice: no admin or chamber');
      throw new Error('Not authenticated or chamber not loaded');
    }

    const chamberRef = doc(db, 'Chamber', chamber.id);

    try {
      if (typeof data === 'string') {
        // Existing practice: add Practice ID to Chamber Practice
        console.log('Adding existing practice ID:', data);
        const practiceRef = doc(db, 'Practice', data);
        const practiceSnap = await getDoc(practiceRef);
        if (!practiceSnap.exists()) {
          throw new Error(`Practice ${data} does not exist`);
        }
        await updateDoc(chamberRef, {
          'Chamber Practice': arrayUnion(data),
        });
        // Update local state
        setChamberPractices((prev) => {
          if (prev.some((d) => d['Practice ID'] === data)) return prev;
          return [
            ...prev,
            {
              id: data,
              'Practice ID': data,
              'Practice Name': practiceSnap.data()['Practice Name'] || '',
            },
          ];
        });
      } else {
        // New practice: create in Practice collection and add to chamber
        console.log('Adding new practice:', data);
        const practiceRef = doc(db, 'Practice', data['Practice ID']);
        const practiceSnap = await getDoc(practiceRef);
        if (!practiceSnap.exists()) {
          await setDoc(practiceRef, {
            'Practice ID': data['Practice ID'],
            'Practice Name': data['Practice Name'],
          });
        }
        await updateDoc(chamberRef, {
          'Chamber Practice': arrayUnion(data['Practice ID']),
        });
        // Update local state
        setChamberPractices((prev) => {
          if (prev.some((d) => d['Practice ID'] === data['Practice ID'])) return prev;
          return [...prev, data];
        });
      }
    } catch (err) {
      console.error('Add practice error:', err);
      throw err;
    }
  };

  const updatePractice = async (practice: Practice) => {
    if (!currentAdmin || !chamber) {
      console.warn('Cannot update practice: no admin or chamber');
      throw new Error('Not authenticated or chamber not loaded');
    }

    console.log('Updating practice:', practice);
    try {
      const practiceRef = doc(db, 'Practice', practice['Practice ID']);
      await setDoc(practiceRef, {
        'Practice ID': practice['Practice ID'],
        'Practice Name': practice['Practice Name'],
      });

      setChamberPractices((prev) =>
        prev.map((d) => (d['Practice ID'] === practice['Practice ID'] ? practice : d))
      );
    } catch (err) {
      console.error('Update practice error:', err);
      throw err;
    }
  };

  const deletePractice = async (practiceId: string) => {
    if (!currentAdmin || !chamber) {
      console.warn('Cannot delete practice: no admin or chamber');
      throw new Error('Not authenticated or chamber not loaded');
    }

    console.log('Deleting practice:', practiceId);
    try {
      const chamberRef = doc(db, 'Chamber', chamber.id);
      await updateDoc(chamberRef, {
        'Chamber Practice': arrayRemove(practiceId),
      });

      setChamberPractices((prev) => prev.filter((d) => d['Practice ID'] !== practiceId));
    } catch (err) {
      console.error('Delete practice error:', err);
      throw err;
    }
  };

  // User functions
const addUser = async (user: Omit<Users, 'id'>, authUid: string): Promise<string | undefined> => {
  if (!currentAdmin || !chamber) {
    throw new Error('Cannot add user: admin session or chamber is not available');
  }

  console.log('Adding user:', user);
  try {
    const userData = {
      ...user,
      // id: authUid, // Use auth UID as document ID
      'Chamber ID': chamber.id,
      CreatedAt: Timestamp.fromDate(new Date()),
    };

    // Use setDoc with explicit document ID instead of addDoc
    const userRef = doc(db, 'Users', authUid);
    await setDoc(userRef, userData);

    const newUser: Users = {
      id: authUid, // Use auth UID as document ID
      ...userData,
    };
    setChamberUsers((prev) => [...prev, newUser]);
    return authUid;
  } catch (err) {
    console.error('Add user error:', err);
    throw err;
  }
};

  const updateUser = async (user: Users) => {
    if (!currentAdmin || !chamber) {
      console.warn('Cannot update user: no admin or chamber');
      throw new Error('Not authenticated or chamber not loaded');
    }

    console.log('Updating user:', user);
    try {
      const { id, ...userData } = user;
      const userRef = doc(db, 'Users', id);
      await updateDoc(userRef, userData);

      setChamberUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...userData } : u)));
    } catch (err) {
      console.error('Update user error:', err);
      throw err;
    }
  };

  const toggleUserStatus = async (userId: string) => {
    if (!currentAdmin || !chamber) {
      console.warn('Cannot toggle user status: no admin or chamber');
      throw new Error('Not authenticated or chamber not loaded');
    }

    console.log('Toggling user status:', userId);
    try {
      const userRef = doc(db, 'Users', userId);
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        console.warn('User not found:', userId);
        return;
      }

      const currentStatus = snap.data().Status;
      const newStatus = !currentStatus;
      await updateDoc(userRef, { Status: newStatus });

      setChamberUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, Status: newStatus } : u))
      );
    } catch (err) {
      console.error('Toggle user status error:', err);
      throw err;
    }
  };

  // // Medical record functions
  // const addMedicalRecord = async (
  //   record: Omit<MedicalRecord, 'id' | 'chamberId' | 'createdAt' | 'updatedAt'>
  // ) => {
  //   if (!currentAdmin || !chamber) {
  //     console.warn('Cannot add medical record: no admin or chamber');
  //     throw new Error('Not authenticated or chamber not loaded');
  //   }

  //   console.log('Adding medical record:', record);
  //   try {
  //     const now = Timestamp.fromDate(new Date());
  //     const newRecord: MedicalRecord = {
  //       id: crypto.randomUUID(),
  //       chamberId: chamber.id,
  //       createdAt: now,
  //       updatedAt: now,
  //       ...record,
  //     };

  //     const recordRef = doc(db, 'medicalRecords', newRecord.id);
  //     await setDoc(recordRef, newRecord);
  //     setChamberRecords((prev) => [...prev, newRecord]);
  //   } catch (err) {
  //     console.error('Add medical record error:', err);
  //     throw err;
  //   }
  // };

  // const updateMedicalRecord = async (record: MedicalRecord) => {
  //   if (!currentAdmin || !chamber) {
  //     console.warn('Cannot update medical record: no admin or chamber');
  //     throw new Error('Not authenticated or chamber not loaded');
  //   }

  //   console.log('Updating medical record:', record);
  //   try {
  //     const updated = {
  //       ...record,
  //       updatedAt: Timestamp.fromDate(new Date()),
  //     };

  //     const recordRef = doc(db, 'medicalRecords', record.id);
  //     await setDoc(recordRef, updated);

  //     setChamberRecords((prev) => prev.map((r) => (r.id === record.id ? updated : r)));
  //   } catch (err) {
  //     console.error('Update medical record error:', err);
  //     throw err;
  //   }
  // };

  // // Referral functions
  // const updateReferralStatus = async (referralId: string, status: 'accepted' | 'declined') => {
  //   if (!currentAdmin || !chamber) {
  //     console.warn('Cannot update referral status: no admin or chamber');
  //     throw new Error('Not authenticated or chamber not loaded');
  //   }

  //   console.log('Updating referral status:', { referralId, status });
  //   try {
  //     const referralRef = doc(db, 'Referrals', referralId);
  //     const snap = await getDoc(referralRef);
  //     if (!snap.exists()) {
  //       console.warn('Referral not found:', referralId);
  //       return;
  //     }

  //     const updatedData = {
  //       status,
  //       treatmentGiven: status === 'declined' ? 'Service declined' : snap.data().treatmentGiven,
  //     };

  //     await updateDoc(referralRef, updatedData);

  //     setChamberReferrals((prev) =>
  //       prev.map((r) => (r.id === referralId ? { ...r, ...updatedData } : r))
  //     );
  //   } catch (err) {
  //     console.error('Update referral status error:', err);
  //     throw err;
  //   }
  // };

  // Notification functions
  const markNotificationAsRead = async (notificationId: string) => {
    if ((!currentAdmin && !currentDoctor) || !chamber) {
      console.warn('Cannot mark notification as read: no session or chamber');
      throw new Error('Not authenticated or chamber not loaded');
    }

    console.log('Marking notification as read:', notificationId);
    try {
      const notifRef = doc(db, 'notifications', notificationId);
      await updateDoc(notifRef, { read: true });

      setChamberNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );
    } catch (err) {
      console.error('Mark notification as read error:', err);
      throw err;
    }
  };

  return (
    <ChamberContext.Provider
      value={{
        chamber,
        practices: chamberPractices,
        users: chamberUsers,
        medicalRecords: chamberRecords,
        services: chamberServices,
        referrals: chamberReferrals,
        notifications: chamberNotifications,
        metrics: chamberMetrics,
        setSelectedChamberId,
        addPractice,
        updatePractice,
        deletePractice,
        addUser,
        updateUser,
        toggleUserStatus,
        // addMedicalRecord,
        // updateMedicalRecord,
        // updateReferralStatus,
        markNotificationAsRead,
        loading,
        error,
      }}
    >
      {children}
    </ChamberContext.Provider>
  );
};

export const useChamber = (): ChamberContextType => {
  const context = useContext(ChamberContext);
  if (context === undefined) {
    throw new Error('useChamber must be used within a ChamberProvider');
  }
  return context;
};

// Backward compatibility - export useHospital as alias
export const useHospital = (): ChamberContextType => {
  return useChamber();
};

