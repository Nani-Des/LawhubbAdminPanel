import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, LoginPortal } from '../contexts/AuthContext';
import Button from '../components/ui/Button';
import { Lock, Mail, Eye, EyeOff, Building2, Briefcase } from 'lucide-react';
import toast from 'react-hot-toast';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [portal, setPortal] = useState<LoginPortal>('admin');

  const { login, isAuthenticated, currentAdmin, currentDoctor } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) return;
    if (currentDoctor) navigate('/doctor', { replace: true });
    else if (currentAdmin) navigate('/', { replace: true });
  }, [isAuthenticated, currentAdmin, currentDoctor, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const success = await login(email, password, portal);
    setIsLoading(false);

    if (success) {
      navigate(portal === 'doctor' ? '/doctor' : '/');
    } else {
      toast.error(
        portal === 'doctor'
          ? 'Sign-in failed. Check your email and password, or confirm your member account is active.'
          : 'Sign-in failed. Check your email and password, or use an administrator account.'
      );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-100 to-slate-200 px-4 py-10">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">Law Hubb</h1>
          <p className="mt-1 text-slate-600">Choose how you want to sign in</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setPortal('admin')}
            className={`rounded-2xl border-2 p-4 text-left transition ${
              portal === 'admin'
                ? 'border-teal-600 bg-white shadow-md ring-2 ring-teal-200'
                : 'border-slate-200 bg-white/80 hover:border-slate-300'
            }`}
          >
            <Building2 className={`h-8 w-8 ${portal === 'admin' ? 'text-teal-600' : 'text-slate-400'}`} />
            <p className="mt-2 font-semibold text-slate-900">Chamber admin</p>
            <p className="mt-1 text-xs text-slate-600">
              For staff who manage chambers, members, and settings in this dashboard.
            </p>
          </button>
          <button
            type="button"
            onClick={() => setPortal('doctor')}
            className={`rounded-2xl border-2 p-4 text-left transition ${
              portal === 'doctor'
                ? 'border-teal-600 bg-white shadow-md ring-2 ring-teal-200'
                : 'border-slate-200 bg-white/80 hover:border-slate-300'
            }`}
          >
            <Briefcase className={`h-8 w-8 ${portal === 'doctor' ? 'text-teal-600' : 'text-slate-400'}`} />
            <p className="mt-2 font-semibold text-slate-900">Member workspace</p>
            <p className="mt-1 text-xs text-slate-600">
              For chamber members: use the same email and password as the LawHubb app. You can handle referrals,
              your library, chats, and video calls here.
            </p>
          </button>
        </div>

        <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100">
          <h2 className="text-lg font-semibold text-center mb-6 text-slate-800">
            {portal === 'admin' ? 'Sign in as administrator' : 'Sign in as chamber member'}
          </h2>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  placeholder={portal === 'admin' ? 'admin@chamber.com' : 'your.managed@email.com'}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  className="absolute right-3 top-3 text-slate-500"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <Button type="submit" fullWidth isLoading={isLoading}>
              {portal === 'admin' ? 'Sign in to admin panel' : 'Sign in to member workspace'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
