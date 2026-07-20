import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  FolderPlus,
  Activity,
  RefreshCw,
  LogOut,
  Menu,
  X,
  FilePlus2,
  CircleUser,
  Clock,
  Upload,
  Bell,
  Building2,
  FileBarChart,
  ShieldCheck
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useChamber } from '../../contexts/ChamberContext';
import { db, storage } from '../../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { currentAdmin, logout } = useAuth();
  const { chamber, notifications, setSelectedChamberId } = useChamber();
  const location = useLocation();
  const navigate = useNavigate();
  
  const handleSwitchChamber = () => {
    if (setSelectedChamberId) {
      setSelectedChamberId('');
    }
    navigate('/select-chamber');
  };
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [chamberLogo, setChamberLogo] = useState<string | null>(null);
  const [chamberBanner, setChamberBanner] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const unreadNotifications = notifications.filter(n => !n.read).length;

  // Fetch chamber logo and banner from Firestore
  useEffect(() => {
    const fetchChamberData = async () => {
      if (chamber?.id) {
        try {
          const chamberDoc = await getDoc(doc(db, 'Chamber', chamber.id));
          if (chamberDoc.exists()) {
            const data = chamberDoc.data();
            setChamberLogo(data.Logo || null);
            setChamberBanner(data['Background Image'] || null);
          }
        } catch (err) {
          console.error('Failed to fetch chamber data:', err);
          setChamberLogo(null);
          setChamberBanner(null);
        }
      }
    };
    fetchChamberData();
  }, [chamber?.id]);

  // Handle file uploads
  const handleUpload = async () => {
    // Only chamber_admin can upload images (keeping hospital_admin for backward compatibility)
    if (!chamber?.id || (currentAdmin?.baseRole !== 'chamber_admin' && currentAdmin?.baseRole !== 'hospital_admin') || (!logoFile && !bannerFile)) return;

    setIsUploading(true);
    try {
      const updates: { [key: string]: string } = {};
      if (logoFile) {
        const logoRef = ref(storage, `chamber_logos/${chamber.id}/logo.png`);
        await uploadBytes(logoRef, logoFile);
        const logoUrl = await getDownloadURL(logoRef);
        updates.Logo = logoUrl;
        setChamberLogo(logoUrl);
      }
      if (bannerFile) {
        const bannerRef = ref(storage, `chamber_logos/${chamber.id}/banner.png`);
        await uploadBytes(bannerRef, bannerFile);
        const bannerUrl = await getDownloadURL(bannerRef);
        updates['Background Image'] = bannerUrl;
        setChamberBanner(bannerUrl);
      }
      if (Object.keys(updates).length > 0) {
        await updateDoc(doc(db, 'Chamber', chamber.id), updates);
      }
      setIsModalOpen(false);
      setLogoFile(null);
      setBannerFile(null);
    } catch (err) {
      console.error('Failed to upload images:', err);
    } finally {
      setIsUploading(false);
    }
  };

  // Helper function to check if user has permission
  const hasPermission = (permissionKey: string): boolean => {
    if (!currentAdmin?.permissions) return false;
    
    // If permissions is an array of strings
    if (Array.isArray(currentAdmin.permissions)) {
      return currentAdmin.permissions.includes(permissionKey);
    }
    
    // If permissions is an object with boolean values
    if (typeof currentAdmin.permissions === 'object') {
      return currentAdmin.permissions[permissionKey] === true;
    }
    
    return false;
  };

  // All navigation items with their permission keys
  const allNavItems = [
    { label: 'Dashboard', path: '/', icon: <LayoutDashboard className="w-5 h-5" />, permission: 'dashboard' },
    { label: 'Practice Area', path: '/practices', icon: <FolderPlus className="w-5 h-5" />, permission: 'practices' },
    { label: 'Attachments', path: '/attachments', icon: <FileText className="w-5 h-5" />, permission: 'attachments' },
    { label: 'Members', path: '/lawyers', icon: <CircleUser className="w-5 h-5" />, permission: 'lawyers' },
    { label: 'Shift Schedule', path: '/shift-schedule', icon: <Clock className="w-5 h-5" />, permission: 'shift_schedule' },
    { label: 'Services', path: '/services', icon: <FilePlus2 className="w-5 h-5" />, permission: 'services' },
    { label: 'Referrals', path: '/referrals', icon: <RefreshCw className="w-5 h-5" />, permission: 'referrals' },
    { label: 'Reports', path: '/reports', icon: <FileBarChart className="w-5 h-5" />, permission: 'reports' },
    { label: 'Lawyer Verifications', path: '/lawyer-verifications', icon: <ShieldCheck className="w-5 h-5" />, permission: 'lawyer_verifications' },
    { label: 'Notifications', path: '/notifications', icon: <Bell className="w-5 h-5" />, permission: 'notifications', badge: unreadNotifications },
  ];

  // Filter navigation items based on permissions
  // Dashboard is always available, others require permission
  // main_admin has access to everything
  const isMainAdminSelectingChamber =
    currentAdmin?.baseRole === 'main_admin' && location.pathname === '/select-chamber';
  const isMainAdminWithoutChamber = currentAdmin?.baseRole === 'main_admin' && !chamber?.id;
  const navItems = allNavItems.filter(item => {
    if (isMainAdminSelectingChamber || isMainAdminWithoutChamber) return false;
    if (item.path === '/') return true; // Dashboard is always accessible
    if (item.path === '/reports') return currentAdmin?.baseRole === 'main_admin';
    if (item.path === '/lawyer-verifications') {
      return currentAdmin?.baseRole === 'main_admin' || hasPermission('lawyer_verifications');
    }
    // main_admin has access to all pages after selecting a chamber
    if (currentAdmin?.baseRole === 'main_admin') return true;
    return hasPermission(item.permission);
  });

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleNavigation = (path: string) => {
    navigate(path);
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header
        className="text-white shadow-md sticky top-0"
          style={{
          background: chamberBanner
            ? `url(${chamberBanner}) no-repeat center/cover`
            : 'linear-gradient(to right, #1f2937, #111827)',
        }}
      >
        <div className="px-4 sm:px-6 lg:px-8 backdrop-blur-sm bg-black/40">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <button
                type="button"
                className="lg:hidden p-2 rounded-lg text-gray-200 hover:text-white hover:bg-black/30 focus:outline-none transition-colors duration-200"
                onClick={toggleSidebar}
              >
                <span className="sr-only">Open sidebar</span>
                <Menu className="h-6 w-6" />
              </button>
              <div className="flex-shrink-0 flex items-center ml-4">
                <div className="p-2 rounded-lg bg-white/10 backdrop-blur-sm shadow-md">
                  <Activity className="h-6 w-6 text-white" />
                </div>
                <span className="ml-3 text-xl font-bold text-white">
                  {currentAdmin?.baseRole === 'main_admin' 
                    ? 'Super Admin' 
                    : `${chamber?.["Chamber Name"] || 'Chamber'} Admin`}
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  {chamberLogo ? (
                    <img
                      src={chamberLogo}
                      alt="Chamber Logo"
                      className="h-10 w-10 rounded-lg object-cover shadow-md cursor-pointer"
                      onClick={() => (currentAdmin?.baseRole === 'chamber_admin' || currentAdmin?.baseRole === 'hospital_admin') && setIsModalOpen(true)}
                      title="Change logo and banner"
                    />
                  ) : (
                    <div
                      className="h-10 w-10 rounded-lg bg-gradient-to-r from-gray-700 to-gray-900 flex items-center justify-center text-white font-semibold shadow-md cursor-pointer"
                      onClick={() => (currentAdmin?.baseRole === 'chamber_admin' || currentAdmin?.baseRole === 'hospital_admin') && setIsModalOpen(true)}
                      title="Change logo and banner"
                    >
                      {currentAdmin?.name ? currentAdmin.name.charAt(0) : ''}
                    </div>
                  )}
                </div>
                <div className="hidden md:block">
                  <div className="text-sm font-semibold text-white">
                    {currentAdmin?.name || 'Admin'}
                  </div>
                  <div className="text-xs text-gray-200 truncate">
                    {currentAdmin?.baseRole === 'main_admin' 
                      ? 'Super Admin' 
                      : chamber?.["Chamber Name"] || 'Chamber'}
                  </div>
                </div>
              </div>
              {currentAdmin?.baseRole === 'main_admin' && (
                <button
                  onClick={handleSwitchChamber}
                  className="p-2 rounded-lg text-gray-200 hover:text-white hover:bg-black/30 focus:outline-none transition-colors duration-200"
                  title="Switch Chamber"
                >
                  <Building2 className="h-5 w-5" />
                </button>
              )}
              <button
                onClick={handleLogout}
                className="p-2 rounded-lg text-gray-200 hover:text-white hover:bg-black/30 focus:outline-none transition-colors duration-200"
                title="Log out"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Upload Modal */}
      {isModalOpen && (currentAdmin?.baseRole === 'chamber_admin' || currentAdmin?.baseRole === 'hospital_admin') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Update Chamber Images</h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-600 hover:text-gray-900"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Chamber Logo
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                  className="w-full p-2 border border-gray-300 rounded-lg text-gray-700 bg-gray-50"
                  disabled={isUploading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Header Banner
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setBannerFile(e.target.files?.[0] || null)}
                  className="w-full p-2 border border-gray-300 rounded-lg text-gray-700 bg-gray-50"
                  disabled={isUploading}
                />
              </div>
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-gray-700 bg-gray-200 hover:bg-gray-300 transition-colors"
                  disabled={isUploading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpload}
                  className="px-4 py-2 rounded-lg text-white bg-gray-800 hover:bg-gray-900 transition-colors flex items-center"
                  disabled={isUploading || (!logoFile && !bannerFile)}
                >
                  {isUploading ? (
                    <svg className="animate-spin h-5 w-5 mr-2 text-white" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <Upload className="h-5 w-5 mr-2" />
                  )}
                  {isUploading ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Mobile Sidebar */}
        <div
          className={`lg:hidden fixed inset-0 z-50 flex transition-transform duration-300 ease-in-out ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white shadow-2xl border-r border-gray-200">
            <div className="absolute top-0 right-0 -mr-12 pt-2">
              <button
                type="button"
                className="ml-1 flex items-center justify-center h-10 w-10 rounded-full bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-gray-400"
                onClick={toggleSidebar}
              >
                <span className="sr-only">Close sidebar</span>
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="flex-1 h-0 pt-5 pb-4 overflow-y-auto">
              <div className="mt-5 px-3 space-y-2">
                {navItems.map((item) => (
                  <button
                    key={item.path}
                    onClick={() => handleNavigation(item.path)}
                    className={`group flex items-center px-4 py-3 text-base font-medium rounded-lg w-full transition-all duration-200 transform hover:scale-[1.02] ${
                      location.pathname === item.path
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    <span className={`mr-3 group-hover:scale-110 transition-transform duration-200 ${
                      location.pathname === item.path ? 'text-white' : 'text-gray-600 group-hover:text-gray-900'
                    }`}>
                      {item.icon}
                    </span>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex-shrink-0 w-14 bg-black/50" aria-hidden="true"></div>
        </div>

        {/* Desktop Sidebar */}
        <div className="hidden lg:flex lg:flex-shrink-0">
          <div className="flex flex-col w-72 bg-white border-r border-gray-200 shadow-lg">
            <div className="flex-1 flex flex-col pt-5 pb-4 overflow-y-auto">
              <div className="mt-5 flex-1 px-3 space-y-2">
                {navItems.map((item) => {
                  const isActive = location.pathname === item.path;
                  return (
                    <button
                      key={item.path}
                      onClick={() => handleNavigation(item.path)}
                      className={`group flex items-center px-4 py-3 text-sm font-medium rounded-lg w-full transition-all duration-200 transform hover:scale-[1.02] relative group ${
                        isActive
                          ? 'bg-gray-900 text-white'
                          : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                    >
                      <span className={`mr-3 transition-transform duration-200 group-hover:scale-110 ${
                        isActive ? 'text-white' : 'text-gray-600 group-hover:text-gray-900'
                      }`}>
                        {item.icon}
                      </span>
                      {item.label}
                      <span className="absolute left-0 top-0 h-full w-1 bg-gray-900 opacity-0 group-hover:opacity-100 transition-opacity duration-200"></span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex-shrink-0 flex border-t border-gray-200 p-4">
              <div className="flex items-center w-full">
                <div className="flex-shrink-0">
                  {chamberLogo ? (
                    <img
                      src={chamberLogo}
                      alt="Chamber Logo"
                      className="h-12 w-12 rounded-lg object-cover shadow-md cursor-pointer"
                      onClick={() => (currentAdmin?.baseRole === 'chamber_admin' || currentAdmin?.baseRole === 'hospital_admin') && setIsModalOpen(true)}
                      title="Change logo and banner"
                    />
                  ) : (
                    <div
                      className="h-12 w-12 rounded-lg bg-gradient-to-r from-gray-700 to-gray-900 flex items-center justify-center text-white font-semibold shadow-md"
                      onClick={() => (currentAdmin?.baseRole === 'chamber_admin' || currentAdmin?.baseRole === 'hospital_admin') && setIsModalOpen(true)}
                      title="Change logo and banner"
                    >
                      {currentAdmin?.name ? currentAdmin.name.charAt(0) : ''}
                    </div>
                  )}
                </div>
                <div className="ml-3">
                  <div className="text-sm font-medium text-gray-900">
                    {currentAdmin?.name || 'Admin'}
                  </div>
                  <div className="text-xs text-gray-600 truncate text-wrap">
                    {currentAdmin?.baseRole === 'main_admin' 
                      ? 'Super Admin' 
                      : chamber?.["Chamber Name"] || 'Chamber'}
                  </div>
                </div>
                {currentAdmin?.baseRole === 'main_admin' && (
                  <button
                    onClick={handleSwitchChamber}
                    className="ml-2 p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 focus:outline-none transition-colors duration-200"
                    title="Switch Chamber"
                  >
                    <Building2 className="h-5 w-5" />
                  </button>
                )}
                <button
                  onClick={handleLogout}
                  className="ml-auto p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 focus:outline-none transition-colors duration-200"
                  title="Log out"
                >
                  <LogOut className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Main content */}
        <main className="flex-1 relative z-0 overflow-y-auto focus:outline-none">
          <div className="p-4 sm:p-6 lg:p-8 animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
