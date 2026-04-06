import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ChamberProvider, useChamber } from './contexts/ChamberContext';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ChamberSelectionPage from './pages/ChamberSelectionPage';
// import UsersPage from './pages/UsersPage';
import AttachmentsPage from './pages/AttachmentsPage';
import LawyersPage from './pages/LawyersPage';
import ServicesPage from './pages/ServicesPage';
// import RatingsPage from './pages/RatingsPage';
import NotFoundPage from './pages/NotFoundPage';
// import AddDepartmentPage from './pages/AddDepartmentPage';
import DepartmentsPage from './pages/DepartmentsPage';
import SettingsPage from './pages/SettingsPage';
// import NotificationsPage from './pages/NotificationsPage';
import ReferralsPage from './pages/ReferralsPage';
import ShiftSchedule from './pages/ShiftSchedule';
import ReportsPage from './pages/ReportsPage';
import { Toaster } from 'react-hot-toast';
import NotificationsPage from './pages/NotificationsPage';
import DoctorDashboardPage from './pages/doctor/DoctorDashboardPage';
import DoctorReferralsPage from './pages/doctor/DoctorReferralsPage';
import DoctorNewReferralPage from './pages/doctor/DoctorNewReferralPage';
import DoctorLibraryPage from './pages/doctor/DoctorLibraryPage';
import DoctorVideoConsultationsPage from './pages/doctor/DoctorVideoConsultationsPage';
// import ShiftSchedulePage from './pages/ShiftSchedulePage';

/** Chamber administrators and super admin */
const AdminProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, currentAdmin, currentDoctor } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (currentDoctor && !currentAdmin) {
    return <Navigate to="/doctor" replace />;
  }
  if (!currentAdmin) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

/** Lawyers / doctors (Users.Role === true) — separate workspace */
const DoctorProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, currentAdmin, currentDoctor } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (currentAdmin && !currentDoctor) {
    return <Navigate to="/" replace />;
  }
  if (!currentDoctor) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const ProtectedRoute = AdminProtectedRoute;

// Component to handle main_admin routing
const MainAdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentAdmin } = useAuth();
  const { chamber } = useChamber();
  
  // If main_admin and no chamber selected, redirect to chamber selection
  if (currentAdmin?.baseRole === 'main_admin' && !chamber) {
    return <Navigate to="/select-chamber" replace />;
  }
  
  return <>{children}</>;
};

// Helper function to check if user has permission
const hasPermission = (permissions: string[] | { [key: string]: boolean } | undefined, permissionKey: string): boolean => {
  if (!permissions) return false;
  
  // If permissions is an array of strings
  if (Array.isArray(permissions)) {
    return permissions.includes(permissionKey);
  }
  
  // If permissions is an object with boolean values
  if (typeof permissions === 'object') {
    return permissions[permissionKey] === true;
  }
  
  return false;
};

const PermissionProtectedRoute: React.FC<{ 
  children: React.ReactNode; 
  permission: string;
}> = ({ children, permission }) => {
  const { isAuthenticated, currentAdmin, currentDoctor } = useAuth();
  const { chamber } = useChamber();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (currentDoctor && !currentAdmin) {
    return <Navigate to="/doctor" replace />;
  }
  
  // For main_admin, require chamber selection
  if (currentAdmin?.baseRole === 'main_admin' && !chamber) {
    return <Navigate to="/select-chamber" replace />;
  }
  
  // Dashboard is always accessible
  if (permission === 'dashboard') {
    return <>{children}</>;
  }
  
  // main_admin has access to everything (if hospital is selected)
  if (currentAdmin?.baseRole === 'main_admin') {
    return <>{children}</>;
  }
  
  // Check if user has the required permission
  if (!hasPermission(currentAdmin?.permissions, permission)) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <Router>
      <AuthProvider>
        <ChamberProvider>
                <Toaster position="top-center" reverseOrder={false} />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/doctor"
              element={
                <DoctorProtectedRoute>
                  <DoctorDashboardPage />
                </DoctorProtectedRoute>
              }
            />
            <Route
              path="/doctor/referrals"
              element={
                <DoctorProtectedRoute>
                  <DoctorReferralsPage />
                </DoctorProtectedRoute>
              }
            />
            <Route
              path="/doctor/referrals/new"
              element={
                <DoctorProtectedRoute>
                  <DoctorNewReferralPage />
                </DoctorProtectedRoute>
              }
            />
            <Route
              path="/doctor/library"
              element={
                <DoctorProtectedRoute>
                  <DoctorLibraryPage />
                </DoctorProtectedRoute>
              }
            />
            <Route
              path="/doctor/chats"
              element={
                <DoctorProtectedRoute>
                  <DoctorVideoConsultationsPage />
                </DoctorProtectedRoute>
              }
            />
            <Route path="/doctor/consultations" element={<Navigate to="/doctor/chats" replace />} />
            <Route 
              path="/select-chamber" 
              element={
                <ProtectedRoute>
                  <ChamberSelectionPage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/" 
              element={
                <ProtectedRoute>
                  <MainAdminRoute>
                    <DashboardPage />
                  </MainAdminRoute>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/practices" 
              element={
                <PermissionProtectedRoute permission="practices">
                  <DepartmentsPage />
                </PermissionProtectedRoute>
              } 
            />
            {/* <Route 
              path="/departments/new" 
              element={
                <ProtectedRoute>
                  <AddDepartmentPage />
                </ProtectedRoute>
              } 
            /> */}
            {/* <Route 
              path="/users" 
              element={
                <ProtectedRoute>
                  <UsersPage />
                </ProtectedRoute>
              } 
            /> */}
            <Route 
              path="/attachments" 
              element={
                <PermissionProtectedRoute permission="attachments">
                  <AttachmentsPage />
                </PermissionProtectedRoute>
              } 
            />
            <Route 
              path="/lawyers" 
              element={
                <PermissionProtectedRoute permission="lawyers">
                  <LawyersPage />
                </PermissionProtectedRoute>
              } 
            />
            <Route 
              path="/shift-schedule" 
              element={
                <PermissionProtectedRoute permission="shift_schedule">
                  <ShiftSchedule />
                </PermissionProtectedRoute>
              } 
            />
            <Route 
              path="/services" 
              element={
                <PermissionProtectedRoute permission="services">
                  <ServicesPage />
                </PermissionProtectedRoute>
              } 
            />
            <Route 
              path="/notifications" 
              element={
                <PermissionProtectedRoute permission="notifications">
                  <NotificationsPage />
                </PermissionProtectedRoute>
              } 
            />
            {/* <Route 
              path="/ratings" 
              element={
                <ProtectedRoute>
                  <RatingsPage />
                </ProtectedRoute>
              } 
            /> */}
            <Route 
              path="/referrals" 
              element={
                <PermissionProtectedRoute permission="referrals">
                  <ReferralsPage />
                </PermissionProtectedRoute>
              } 
            />
            <Route 
              path="/reports" 
              element={
                <PermissionProtectedRoute permission="reports">
                  <ReportsPage />
                </PermissionProtectedRoute>
              } 
            />
            <Route 
              path="/settings" 
              element={
                <ProtectedRoute>
                  <SettingsPage />
                </ProtectedRoute>
              } 
            />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </ChamberProvider>
      </AuthProvider>
    </Router>
  );
};

export default App;