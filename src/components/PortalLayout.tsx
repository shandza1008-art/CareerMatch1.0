import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  Bell,
  Check,
  Home,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { apiRequest } from '../lib/api';
import { NotificationItem, RecruiterProfile, StudentProfile } from '../types';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface PortalLayoutProps {
  portalTitle: string;
  navItems: NavItem[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  onGoHome: () => void;
  children: React.ReactNode;
}

const SPRING_POP = { type: 'spring' as const, stiffness: 360, damping: 26 };

export function PortalLayout({
  portalTitle,
  navItems,
  activeTab,
  onTabChange,
  onGoHome,
  children,
}: PortalLayoutProps) {
  const { user, profile, logout, refreshMe } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState('');

  // Profile form state
  const sp = user?.role === 'student' ? (profile as StudentProfile | null) : null;
  const rp = user?.role === 'recruiter' ? (profile as RecruiterProfile | null) : null;

  const [profForm, setProfForm] = useState({
    fullName: user?.full_name || '',
    phone: user?.phone || '',
    location: user?.location || '',
    headline: user?.headline || '',
    companyName: user?.company_name || rp?.company_name || '',
    university: sp?.university || '',
    degree: sp?.degree || '',
    targetRole: sp?.target_role || '',
    skillsText: (sp?.skills || []).join(', '),
    experienceYears: String(sp?.experience_years ?? 0),
    bio: sp?.bio || rp?.bio || '',
  });
  const [profSaved, setProfSaved] = useState('');
  const [profError, setProfError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Issue reporting form
  const [issueSubject, setIssueSubject] = useState('');
  const [issueDesc, setIssueDesc] = useState('');
  const [issueStatus, setIssueStatus] = useState('');

  const loadNotifications = () => {
    apiRequest<NotificationItem[]>('/api/notifications').then(setNotifications).catch(() => {});
  };

  useEffect(() => {
    loadNotifications();
  }, [activeTab]);

  useEffect(() => {
    setProfForm({
      fullName: user?.full_name || '',
      phone: user?.phone || '',
      location: user?.location || '',
      headline: user?.headline || '',
      companyName: user?.company_name || rp?.company_name || '',
      university: sp?.university || '',
      degree: sp?.degree || '',
      targetRole: sp?.target_role || '',
      skillsText: (sp?.skills || []).join(', '),
      experienceYears: String(sp?.experience_years ?? 0),
      bio: sp?.bio || rp?.bio || '',
    });
  }, [user, profile, profileOpen]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const activeItem = navItems.find((i) => i.id === activeTab);

  const handleMarkRead = async (id: number, linkTab?: string) => {
    await apiRequest(`/api/notifications/${id}/read`, { method: 'PATCH' });
    loadNotifications();
    if (linkTab && navItems.some((n) => n.id === linkTab)) {
      onTabChange(linkTab);
      setNotifOpen(false);
    }
  };

  const handleReadAll = async () => {
    await apiRequest('/api/notifications/read-all', { method: 'POST' });
    loadNotifications();
  };

  const handleVerifyEmail = async () => {
    try {
      await apiRequest('/api/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token: user?.verification_token || '' }),
      });
      setVerifyMsg('Email verified.');
      await refreshMe();
    } catch (err) {
      setVerifyMsg(err instanceof Error ? err.message : 'Verification failed.');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfError('');
    setProfSaved('');
    try {
      await apiRequest('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({
          fullName: profForm.fullName,
          phone: profForm.phone,
          location: profForm.location,
          headline: profForm.headline,
          companyName: profForm.companyName,
          university: profForm.university,
          degree: profForm.degree,
          targetRole: profForm.targetRole,
          skills: profForm.skillsText.split(',').map((s) => s.trim()).filter(Boolean),
          experienceYears: Number(profForm.experienceYears) || 0,
          bio: profForm.bio,
        }),
      });
      await refreshMe();
      setProfSaved('Profile updated successfully.');
    } catch (err) {
      setProfError(err instanceof Error ? err.message : 'Could not update profile.');
    }
  };

  const handleDeleteAccount = async () => {
    await apiRequest('/api/auth/account', { method: 'DELETE' });
    await logout();
  };

  const handleReportIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    setIssueStatus('');
    try {
      await apiRequest('/api/issues', {
        method: 'POST',
        body: JSON.stringify({ subject: issueSubject, description: issueDesc }),
      });
      setIssueStatus('Report submitted to platform administrators.');
      setIssueSubject('');
      setIssueDesc('');
    } catch (err) {
      setIssueStatus(err instanceof Error ? err.message : 'Failed to submit report.');
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-[#071118] dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-slate-200 lg:bg-white dark:lg:border-slate-800 dark:lg:bg-slate-900">
        <div className="flex h-16 items-center border-b border-slate-200 px-5 dark:border-slate-800">
          <button type="button" onClick={onGoHome} className="text-left">
            <BrandLogo size="sm" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-5">
          <p className="px-3 text-xs font-semibold text-slate-500 dark:text-slate-400">{portalTitle}</p>
          <nav className="mt-2.5 space-y-1.5">
            {navItems.map((item) => {
              const active = item.id === activeTab;
              return (
                <motion.button
                  key={item.id}
                  whileHover={{ x: 2 }}
                  whileTap={{ scale: 0.97 }}
                  transition={SPRING_POP}
                  type="button"
                  onClick={() => onTabChange(item.id)}
                  className={`flex w-full items-center gap-3 rounded-full px-3.5 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                    active
                      ? 'btn-glossy-teal'
                      : 'text-slate-700 hover:bg-teal-50/60 hover:text-[#198F90] dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-[#20B4B6]'
                  }`}
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </motion.button>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-slate-200 p-4 space-y-1.5 dark:border-slate-800">
          <button
            type="button"
            onClick={onGoHome}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Home className="h-4 w-4" />
            <span>Landing Page</span>
          </button>
          <button
            type="button"
            onClick={() => setIssueOpen(true)}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <AlertTriangle className="h-4 w-4" />
            <span>Report Issue</span>
          </button>
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Settings className="h-4 w-4" />
            <span>Profile &amp; Privacy</span>
          </button>
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar Drawer */}
      <AnimatePresence>
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-950/50"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={SPRING_POP}
              className="relative z-10 flex w-72 flex-col bg-white p-4 dark:bg-slate-900"
            >
              <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                <BrandLogo size="sm" />
                <button type="button" onClick={() => setSidebarOpen(false)} className="p-1.5 text-slate-500">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="mt-4 flex-1 space-y-1.5 overflow-y-auto">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onTabChange(item.id);
                      setSidebarOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-full px-3.5 py-2.5 text-sm font-semibold ${
                      item.id === activeTab
                        ? 'btn-glossy-teal'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </nav>
              <div className="border-t border-slate-200 pt-3 space-y-1 dark:border-slate-800">
                <button onClick={() => { setProfileOpen(true); setSidebarOpen(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                  <Settings className="h-4 w-4" /> Profile &amp; Privacy
                </button>
                <button onClick={logout} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400">
                  <LogOut className="h-4 w-4" /> Sign Out
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 backdrop-blur-md px-4 sm:px-6 dark:border-slate-800 dark:bg-slate-900/95">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
              className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 dark:border-slate-800 dark:text-slate-200"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="hidden sm:inline text-slate-500 dark:text-slate-400">{portalTitle}</span>
              <span className="hidden sm:inline text-slate-300 dark:text-slate-700">/</span>
              <span className="truncate font-semibold text-slate-950 dark:text-white">
                {activeItem?.label || 'Overview'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <motion.button
              whileTap={{ scale: 0.92 }}
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle color theme"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:border-[#1EA8A9] hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </motion.button>

            {/* Interactive Notification Centre */}
            <div className="relative">
              <motion.button
                whileTap={{ scale: 0.94 }}
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                aria-label="Notifications"
                className="relative inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:border-[#1EA8A9] hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="font-mono text-xs font-bold tabular-nums text-[#198F90] dark:text-[#20B4B6]">
                    {unreadCount}
                  </span>
                )}
              </motion.button>

              <AnimatePresence>
                {notifOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.95 }}
                    transition={SPRING_POP}
                    className="surface-specular-card absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-800 dark:bg-slate-900 z-50"
                  >
                    <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                      <span className="text-sm font-semibold text-slate-950 dark:text-white">Notifications</span>
                      <button onClick={handleReadAll} className="text-xs font-medium text-[#198F90] hover:underline dark:text-[#20B4B6]">
                        Mark all read
                      </button>
                    </div>
                    <div className="mt-2 max-h-80 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                      {notifications.length === 0 ? (
                        <p className="py-6 text-center text-xs text-slate-500">No notifications yet.</p>
                      ) : (
                        notifications.map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => handleMarkRead(n.id, n.link_tab)}
                            className={`w-full py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                              n.is_read ? 'opacity-70' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-slate-900 dark:text-white">{n.title}</span>
                              {!n.is_read && <span className="text-[11px] font-semibold text-[#198F90] dark:text-[#20B4B6]">New</span>}
                            </div>
                            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{n.message}</p>
                          </button>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="hidden sm:inline-flex items-center gap-2 rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-800 hover:border-[#1EA8A9] hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <span className="max-w-[140px] truncate">{user?.full_name}</span>
              <span className="text-slate-400">·</span>
              <span className="capitalize text-slate-500 dark:text-slate-400">{user?.role}</span>
            </button>
          </div>
        </header>

        {user && !user.email_verified && (
          <div className="border-b border-amber-200 bg-amber-50 px-6 py-2.5 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Your email ({user.email}) is pending verification. Verify now to enable full recruitment visibility.
              </span>
              <div className="flex items-center gap-3">
                {verifyMsg && <span className="font-semibold">{verifyMsg}</span>}
                <button
                  type="button"
                  onClick={handleVerifyEmail}
                  className="inline-flex items-center gap-1 rounded-full bg-amber-900 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-800 dark:bg-amber-600"
                >
                  <Check className="h-3.5 w-3.5" />
                  Verify Email Now
                </button>
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 12, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Profile & Privacy Modal */}
      <AnimatePresence>
        {profileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 10 }}
              transition={SPRING_POP}
              className="surface-specular-card max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                <h2 className="text-lg font-bold text-slate-950 dark:text-white">Profile &amp; Data Privacy</h2>
                <button type="button" onClick={() => setProfileOpen(false)} className="text-slate-500 hover:text-slate-900 dark:hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSaveProfile} className="mt-4 space-y-3.5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Full Name</label>
                    <input
                      type="text"
                      required
                      value={profForm.fullName}
                      onChange={(e) => setProfForm((f) => ({ ...f, fullName: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Location</label>
                    <input
                      type="text"
                      value={profForm.location}
                      onChange={(e) => setProfForm((f) => ({ ...f, location: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Headline</label>
                  <input
                    type="text"
                    value={profForm.headline}
                    onChange={(e) => setProfForm((f) => ({ ...f, headline: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>

                {user?.role === 'student' && (
                  <>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">University</label>
                        <input
                          type="text"
                          value={profForm.university}
                          onChange={(e) => setProfForm((f) => ({ ...f, university: e.target.value }))}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Target Role</label>
                        <input
                          type="text"
                          value={profForm.targetRole}
                          onChange={(e) => setProfForm((f) => ({ ...f, targetRole: e.target.value }))}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Degree</label>
                        <input
                          type="text"
                          value={profForm.degree}
                          onChange={(e) => setProfForm((f) => ({ ...f, degree: e.target.value }))}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Years of Experience</label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={profForm.experienceYears}
                          onChange={(e) => setProfForm((f) => ({ ...f, experienceYears: e.target.value }))}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Skills (comma separated)</label>
                      <input
                        type="text"
                        value={profForm.skillsText}
                        onChange={(e) => setProfForm((f) => ({ ...f, skillsText: e.target.value }))}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      />
                    </div>
                  </>
                )}

                {user?.role === 'recruiter' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Company Name</label>
                    <input
                      type="text"
                      value={profForm.companyName}
                      onChange={(e) => setProfForm((f) => ({ ...f, companyName: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>
                )}

                {profError && <p className="text-xs font-medium text-red-600">{profError}</p>}
                {profSaved && <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{profSaved}</p>}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setProfileOpen(false)}
                    className="rounded-full border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    className="btn-glossy-teal rounded-full px-5 py-2 text-xs font-bold"
                  >
                    Save Profile
                  </button>
                </div>
              </form>

              <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-800">
                <p className="text-xs font-semibold text-red-600 dark:text-red-400">Account &amp; Data Deletion</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Permanently remove your CareerMatch account, resumes, and application history.
                </p>
                {!confirmDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Account
                  </button>
                ) : (
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDeleteAccount}
                      className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                    >
                      Confirm Permanent Deletion
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="rounded-full border border-slate-300 px-3 py-1.5 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Report Issue Modal */}
      <AnimatePresence>
        {issueOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 10 }}
              transition={SPRING_POP}
              className="surface-specular-card w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                <h2 className="text-base font-bold text-slate-950 dark:text-white">Report an Issue</h2>
                <button type="button" onClick={() => setIssueOpen(false)} className="text-slate-500">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleReportIssue} className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Subject</label>
                  <input
                    type="text"
                    required
                    value={issueSubject}
                    onChange={(e) => setIssueSubject(e.target.value)}
                    placeholder="e.g., Incorrect job requirement or screening question"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Details</label>
                  <textarea
                    rows={3}
                    required
                    value={issueDesc}
                    onChange={(e) => setIssueDesc(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
                {issueStatus && <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{issueStatus}</p>}
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setIssueOpen(false)} className="rounded-full border border-slate-300 px-3.5 py-1.5 text-xs dark:border-slate-700">
                    Close
                  </button>
                  <button type="submit" className="btn-glossy-teal rounded-full px-4 py-1.5 text-xs font-bold">
                    Submit Report
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
