import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, MailCheck } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';

export type AuthViewMode = 'login' | 'register-student' | 'register-recruiter' | 'forgot-password';

interface AuthViewsProps {
  initialMode: AuthViewMode;
  onBackToLanding: () => void;
}

const SPRING_POP = { type: 'spring' as const, stiffness: 360, damping: 26 };

export function AuthViews({ initialMode, onBackToLanding }: AuthViewsProps) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<AuthViewMode>(initialMode);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Login / Register state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [university, setUniversity] = useState('');
  const [degree, setDegree] = useState('');

  // Forgot / Reset state
  const [resetStep, setResetStep] = useState<'request' | 'confirm'>('request');
  const [resetToken, setResetToken] = useState('');
  const [resetPreview, setResetPreview] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else if (mode === 'register-student' || mode === 'register-recruiter') {
        await register({
          email,
          password,
          fullName,
          role: mode === 'register-student' ? 'student' : 'recruiter',
          companyName,
          university,
          degree,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (demoEmail: string) => {
    setError('');
    setLoading(true);
    try {
      await login(demoEmail, 'Demo1234!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo login failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      if (resetStep === 'request') {
        const res = await apiRequest<{ message: string; resetTokenPreview?: string }>('/api/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email }),
        });
        setSuccess(res.message);
        if (res.resetTokenPreview) {
          setResetPreview(res.resetTokenPreview);
          setResetToken(res.resetTokenPreview);
        }
        setResetStep('confirm');
      } else {
        const res = await apiRequest<{ message: string }>('/api/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ email, resetToken, newPassword }),
        });
        setSuccess(res.message);
        setMode('login');
        setResetStep('request');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-teal-50/20 to-slate-50 px-6 py-10 dark:from-[#071118] dark:via-[#091D24] dark:to-[#071118]">
      <div className="mx-auto max-w-md">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBackToLanding}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-[#198F90] dark:text-slate-300 dark:hover:text-[#20B4B6]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </button>
          <BrandLogo size="sm" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={SPRING_POP}
          className="surface-specular-card mt-8 rounded-2xl border border-[#1EA8A9]/25 bg-white p-7 dark:border-[#20B4B6]/25 dark:bg-slate-900"
        >
          {mode !== 'forgot-password' && (
            <div className="mb-6 flex rounded-full bg-slate-100 p-1 dark:bg-slate-800">
              {[
                { id: 'login', label: 'Sign In' },
                { id: 'register-student', label: 'Student' },
                { id: 'register-recruiter', label: 'Recruiter' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setMode(t.id as AuthViewMode);
                    setError('');
                  }}
                  className={`flex-1 rounded-full py-2 text-xs font-semibold transition-all ${
                    mode === t.id
                      ? 'btn-glossy-teal'
                      : 'text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {mode === 'forgot-password' ? (
            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-[#198F90] dark:text-[#20B4B6]" />
                <h1 className="text-xl font-bold text-slate-950 dark:text-white">Reset Password</h1>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {resetStep === 'request'
                  ? 'Enter your account email to generate a secure password reset token.'
                  : 'Enter the reset token and your new password.'}
              </p>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm focus:border-[#1EA8A9] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>

              {resetStep === 'confirm' && (
                <>
                  {resetPreview && (
                    <div className="rounded-lg border border-[#1EA8A9]/40 bg-teal-50 p-3 text-xs text-teal-950 dark:border-[#20B4B6]/40 dark:bg-teal-950/50 dark:text-teal-200">
                      <span className="font-semibold">Verification Reset Code: </span>
                      <span className="font-mono font-bold">{resetPreview}</span>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Reset Token</label>
                    <input
                      type="text"
                      required
                      value={resetToken}
                      onChange={(e) => setResetToken(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">New Password</label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>
                </>
              )}

              {error && <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
              {success && <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{success}</p>}

              <motion.button
                whileHover={{ y: -1, scale: 1.01 }}
                whileTap={{ scale: 0.97 }}
                type="submit"
                disabled={loading}
                className="btn-glossy-teal w-full rounded-full py-2.5 text-sm font-bold disabled:opacity-60"
              >
                {loading ? 'Processing...' : resetStep === 'request' ? 'Generate Reset Code' : 'Update Password'}
              </motion.button>
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setResetStep('request');
                  setError('');
                }}
                className="w-full text-center text-xs font-medium text-slate-600 hover:underline dark:text-slate-400"
              >
                Back to Sign In
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <h1 className="text-xl font-bold text-slate-950 dark:text-white">
                  {mode === 'login' && 'Sign in to CareerMatch'}
                  {mode === 'register-student' && 'Create Student Account'}
                  {mode === 'register-recruiter' && 'Create Recruiter Account'}
                </h1>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {mode === 'login' && 'Access your Student, Recruiter, or Admin portal.'}
                  {mode === 'register-student' && 'Analyze resumes, track applications, and build your career roadmap.'}
                  {mode === 'register-recruiter' && 'Post roles, run blind AI screening, and rank candidates transparently.'}
                </p>
              </div>

              {mode !== 'login' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Full Name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Alex Rivera"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm focus:border-[#1EA8A9] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
              )}

              {mode === 'register-student' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">University</label>
                    <input
                      type="text"
                      value={university}
                      onChange={(e) => setUniversity(e.target.value)}
                      placeholder="State University"
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#1EA8A9] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Degree</label>
                    <input
                      type="text"
                      value={degree}
                      onChange={(e) => setDegree(e.target.value)}
                      placeholder="B.S. Computer Science"
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#1EA8A9] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>
                </div>
              )}

              {mode === 'register-recruiter' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Company / Organization</label>
                  <input
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Acme Engineering"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm focus:border-[#1EA8A9] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@domain.com"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm focus:border-[#1EA8A9] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Password</label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('forgot-password');
                        setError('');
                      }}
                      className="text-xs font-medium text-[#198F90] hover:underline dark:text-[#20B4B6]"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative mt-1.5">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 pr-10 text-sm focus:border-[#1EA8A9] focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label="Toggle password visibility"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
              {success && (
                <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{success}</span>
                </p>
              )}

              <motion.button
                whileHover={{ y: -1, scale: 1.01 }}
                whileTap={{ scale: 0.97 }}
                transition={SPRING_POP}
                type="submit"
                disabled={loading}
                className="btn-glossy-teal w-full rounded-full py-2.5 text-sm font-bold disabled:opacity-60"
              >
                {loading
                  ? 'Please wait...'
                  : mode === 'login'
                  ? 'Sign In'
                  : mode === 'register-student'
                  ? 'Register as Student'
                  : 'Register as Recruiter'}
              </motion.button>
            </form>
          )}

          {/* Clearly Labeled Demonstration Accounts */}
          <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-800">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <MailCheck className="h-3.5 w-3.5 text-[#198F90] dark:text-[#20B4B6]" />
              <span>Demonstration Accounts (Quick Sign-In)</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Pre-seeded sample accounts for evaluating every CareerMatch portal immediately.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { label: 'Student Demo', email: 'maya.student@careermatch.demo' },
                { label: 'Recruiter Demo', email: 'david.recruiter@careermatch.demo' },
                { label: 'Admin Demo', email: 'admin@careermatch.demo' },
              ].map((d) => (
                <motion.button
                  key={d.label}
                  whileHover={{ y: -2, scale: 1.02 }}
                  whileTap={{ scale: 0.95 }}
                  type="button"
                  disabled={loading}
                  onClick={() => handleDemoLogin(d.email)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-medium text-slate-800 hover:border-[#1EA8A9] hover:bg-teal-50/60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-[#20B4B6]"
                >
                  {d.label}
                </motion.button>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
