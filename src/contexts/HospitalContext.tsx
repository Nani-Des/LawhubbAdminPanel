// Backward compatibility layer - provides HospitalContext interface
// that wraps ChamberContext to allow gradual migration

import { useChamber, ChamberContextType } from './ChamberContext';
import { Chamber, Practice } from '../types';

// Export the provider as alias
export { ChamberProvider as HospitalProvider } from './ChamberContext';

// Export types as aliases
export type { Chamber as Hospital, Practice as Department } from '../types';
export type { ChamberContextType as HospitalContextType } from './ChamberContext';

// Compatibility interface that maps old names to new names
interface HospitalContextCompatType {
  hospital: Chamber | null;
  departments: Practice[];
  users: ChamberContextType['users'];
  medicalRecords: ChamberContextType['medicalRecords'];
  services: ChamberContextType['services'];
  referrals: ChamberContextType['referrals'];
  notifications: ChamberContextType['notifications'];
  metrics: ChamberContextType['metrics'];
  addDepartment: (data: string | Practice) => Promise<void>;
  updateDepartment: (department: Practice) => Promise<void>;
  deleteDepartment: (departmentId: string) => Promise<void>;
  addUser: ChamberContextType['addUser'];
  updateUser: ChamberContextType['updateUser'];
  toggleUserStatus: ChamberContextType['toggleUserStatus'];
  markNotificationAsRead: ChamberContextType['markNotificationAsRead'];
  setSelectedHospitalId?: (hospitalId: string) => void;
  loading: boolean;
  error: string | null;
}

// Compatibility hook that maps old property names to new ones
export const useHospital = (): HospitalContextCompatType => {
  const context = useChamber();
  
  return {
    hospital: context.chamber,
    departments: context.practices,
    users: context.users,
    medicalRecords: context.medicalRecords,
    services: context.services,
    referrals: context.referrals,
    notifications: context.notifications,
    metrics: context.metrics,
    addDepartment: context.addPractice,
    updateDepartment: context.updatePractice,
    deleteDepartment: context.deletePractice,
    addUser: context.addUser,
    updateUser: context.updateUser,
    toggleUserStatus: context.toggleUserStatus,
    markNotificationAsRead: context.markNotificationAsRead,
    setSelectedHospitalId: context.setSelectedChamberId,
    loading: context.loading,
    error: context.error,
  };
};
