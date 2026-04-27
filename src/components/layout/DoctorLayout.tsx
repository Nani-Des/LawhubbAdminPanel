import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  LogOut,
  Menu,
  X,
  Briefcase,
  RefreshCw,
  PlusCircle,
  BookOpen,
  MessagesSquare,
  Lightbulb,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useChamber } from '../../contexts/ChamberContext';

interface DoctorLayoutProps {
  children: React.ReactNode;
}

type NavItem = {
  label: string;
  path: string;
  icon: React.ReactNode;
  matchPrefix?: string;
};

const DoctorLayout: React.FC<DoctorLayoutProps> = ({ children }) => {
  const { currentDoctor, logout } = useAuth();
  const { chamber } = useChamber();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems: NavItem[] = [
    { label: 'Home', path: '/lawyer', icon: <LayoutDashboard className="w-5 h-5" /> },
    { label: 'Incoming referrals', path: '/lawyer/referrals', icon: <RefreshCw className="w-5 h-5" /> },
    { label: 'New referral', path: '/lawyer/referrals/new', icon: <PlusCircle className="w-5 h-5" /> },
    { label: 'Library', path: '/lawyer/library', icon: <BookOpen className="w-5 h-5" /> },
    { label: 'Law insights', path: '/lawyer/insights', icon: <Lightbulb className="w-5 h-5" /> },
    {
      label: 'Messages & video',
      path: '/lawyer/chats',
      matchPrefix: '/lawyer/chats',
      icon: <MessagesSquare className="w-5 h-5" />,
    },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isNavActive = (item: NavItem) => {
    if (item.matchPrefix) {
      return location.pathname.startsWith(item.matchPrefix);
    }
    return location.pathname === item.path;
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f4f6f8]">
      <header className="border-b border-slate-800/80 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800 text-white shadow-lg shadow-slate-900/20">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex h-[4.25rem] items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="lg:hidden p-2 rounded-lg hover:bg-white/10"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-6 w-6" />
              </button>
              <div className="flex items-center gap-2">
                <div className="rounded-xl bg-gradient-to-br from-teal-400/25 to-teal-600/10 p-2.5 ring-1 ring-teal-400/20">
                  <Briefcase className="h-6 w-6 text-teal-300" />
                </div>
                <div>
                  <p className="text-sm font-semibold leading-tight tracking-tight">LawHubb — Member workspace</p>
                  <p className="text-xs text-slate-400 truncate max-w-[200px] sm:max-w-md">
                    {chamber?.['Chamber Name'] || chamber?.name || currentDoctor?.chamberName || 'Your chamber'}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium">{currentDoctor?.name || 'Member'}</p>
                <p className="text-xs text-slate-400">Signed in</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm hover:bg-white/10"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r border-slate-200/90 bg-white shadow-xl shadow-slate-200/40 transition-transform lg:static lg:translate-x-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } pt-20 lg:pt-0`}
        >
          <div className="flex justify-end p-2 lg:hidden">
            <button type="button" className="rounded p-2 hover:bg-slate-100" onClick={() => setSidebarOpen(false)}>
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="hidden border-b border-slate-100 px-4 py-4 lg:block">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Menu</p>
          </div>
          <nav className="space-y-1 p-3">
            {navItems.map((item) => {
              const active = isNavActive(item);
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => {
                    navigate(item.path);
                    setSidebarOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-all ${
                    active
                      ? 'bg-gradient-to-r from-teal-600 to-teal-700 text-white shadow-md shadow-teal-900/15'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className={active ? 'text-white' : 'text-slate-500'}>{item.icon}</span>
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        {sidebarOpen && (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
            aria-label="Close menu"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8 lg:rounded-tl-3xl">{children}</main>
      </div>
    </div>
  );
};

export default DoctorLayout;
