import { useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { LandingPage } from './components/LandingPage';
import { AuthViewMode, AuthViews } from './components/AuthViews';
import { StudentPortal } from './components/student/StudentPortal';
import { RecruiterPortal } from './components/recruiter/RecruiterPortal';
import { AdminPortal } from './components/admin/AdminPortal';

function CareerMatchRouter() {
  const { user, loading } = useAuth();
  const [view, setView] = useState<'landing' | 'auth' | 'portal'>('landing');
  const [authMode, setAuthMode] = useState<AuthViewMode>('login');

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl border border-teal-500/30 bg-white px-6 py-4 shadow-lg dark:bg-slate-900"
        >
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Loading CareerMatch...</p>
        </motion.div>
      </div>
    );
  }

  const activeKey = user && (view === 'auth' || view === 'portal') ? `portal-${user.role}` : view;

  return (
    <AnimatePresence mode="wait">
      {user && (view === 'auth' || view === 'portal') ? (
        <motion.div
          key={activeKey}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          {user.role === 'student' && <StudentPortal onGoHome={() => setView('landing')} />}
          {user.role === 'recruiter' && <RecruiterPortal onGoHome={() => setView('landing')} />}
          {user.role === 'admin' && <AdminPortal onGoHome={() => setView('landing')} />}
        </motion.div>
      ) : !user && view === 'auth' ? (
        <motion.div
          key="auth"
          initial={{ opacity: 0, scale: 0.98, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          <AuthViews
            initialMode={authMode}
            onBackToLanding={() => setView('landing')}
          />
        </motion.div>
      ) : (
        <motion.div
          key="landing"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <LandingPage
            user={user}
            onNavigateAuth={(mode) => {
              setAuthMode(mode);
              setView('auth');
            }}
            onOpenPortal={() => setView('portal')}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <AuthProvider>
          <CareerMatchRouter />
        </AuthProvider>
      </ThemeProvider>
    </MotionConfig>
  );
}
