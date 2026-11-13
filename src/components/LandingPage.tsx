import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  FileText,
  Layers,
  MapPin,
  Menu,
  Moon,
  ShieldCheck,
  Sun,
  Target,
  Users,
  X,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { apiRequest } from '../lib/api';
import { useTheme } from '../context/ThemeContext';
import { User } from '../types';

interface LandingPageProps {
  user: User | null;
  onNavigateAuth: (mode: 'login' | 'register-student' | 'register-recruiter') => void;
  onOpenPortal: () => void;
}

interface PublicStats {
  students: number;
  recruiters: number;
  activeJobs: number;
  analyses: number;
  applications: number;
  avgMatchAccuracy: number;
}

interface PublicJob {
  id: number;
  title: string;
  company: string;
  location: string;
  job_type: string;
  experience_level: string;
  salary_range: string;
  requiredSkills: string[];
}

const FAQS = [
  {
    q: 'How does CareerMatch understand skill synonyms instead of exact keyword matching?',
    a: 'Our NLP pipeline normalizes canonical skill families—recognizing that ML equals Machine Learning, NLP equals Natural Language Processing, JS equals JavaScript, and PostgreSQL aligns with SQL—and pairs this with Gemini 4 Hydrogen semantic analysis when available.',
  },
  {
    q: 'How does Blind Resume Screening support fair recruitment?',
    a: 'When Blind Screening is enabled, candidate names, email addresses, phone numbers, and demographic cues are masked before evaluation and ranking. Recruiters review skills, project relevance, and experience first, and can manually correct extracted skills at any time.',
  },
  {
    q: 'Does the AI make automated hiring or rejection decisions?',
    a: 'Never. CareerMatch surfaces transparent score breakdowns—matched skills, missing skills, experience alignment, and project evidence—so human recruiters remain the sole decision-makers.',
  },
  {
    q: 'What resume file formats are supported?',
    a: 'Both students and recruiters can drag and drop text-selectable PDF (.pdf) or Word (.docx) resumes. Client-side and server-side magic-byte checks verify file headers, and SHA-256 hashing flags duplicates automatically.',
  },
];

const SPRING_POP = { type: 'spring' as const, stiffness: 360, damping: 26 };

export function LandingPage({ user, onNavigateAuth, onOpenPortal }: LandingPageProps) {
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [previewTab, setPreviewTab] = useState<'resume' | 'ranking' | 'matching'>('resume');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [jobs, setJobs] = useState<PublicJob[]>([]);
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  const [contactForm, setContactForm] = useState({ name: '', email: '', role: 'Student', message: '' });
  const [contactState, setContactState] = useState<{ loading: boolean; error: string; success: string }>({
    loading: false,
    error: '',
    success: '',
  });

  useEffect(() => {
    apiRequest<PublicStats>('/api/public/stats').then(setStats).catch(() => {});
    apiRequest<PublicJob[]>('/api/public/jobs').then(setJobs).catch(() => {});
  }, []);

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactState({ loading: true, error: '', success: '' });
    try {
      const res = await apiRequest<{ message: string }>('/api/public/contact', {
        method: 'POST',
        body: JSON.stringify(contactForm),
      });
      setContactState({ loading: false, error: '', success: res.message });
      setContactForm({ name: '', email: '', role: 'Student', message: '' });
    } catch (err) {
      setContactState({
        loading: false,
        error: err instanceof Error ? err.message : 'Unable to send message.',
        success: '',
      });
    }
  };

  return (
    <div id="home" className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#071118] dark:text-slate-100">
      {/* Three-Zone Top Navigation Contract */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-md dark:border-slate-800 dark:bg-[#071118]/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-6 py-3.5">
          <a href="#home" className="whitespace-nowrap shrink-0">
            <BrandLogo />
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a href="#home" className="hover:text-[#198F90] dark:hover:text-[#20B4B6] transition-colors whitespace-nowrap shrink-0">
              Home
            </a>
            <a href="#features" className="hover:text-[#198F90] dark:hover:text-[#20B4B6] transition-colors whitespace-nowrap shrink-0">
              Features
            </a>
            <a href="#how-it-works" className="hover:text-[#198F90] dark:hover:text-[#20B4B6] transition-colors whitespace-nowrap shrink-0">
              How It Works
            </a>
            <a href="#about" className="hover:text-[#198F90] dark:hover:text-[#20B4B6] transition-colors whitespace-nowrap shrink-0">
              About
            </a>
            <a href="#contact" className="hover:text-[#198F90] dark:hover:text-[#20B4B6] transition-colors whitespace-nowrap shrink-0">
              Contact
            </a>
          </nav>

          <div className="hidden md:flex items-center gap-4 shrink-0">
            {user ? (
              <motion.button
                whileHover={{ y: -1, scale: 1.02 }}
                whileTap={{ scale: 0.96 }}
                transition={SPRING_POP}
                onClick={onOpenPortal}
                className="btn-glossy-teal inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-bold whitespace-nowrap shrink-0"
              >
                Open Dashboard
                <ArrowRight className="h-4 w-4" />
              </motion.button>
            ) : (
              <>
                <button
                  onClick={() => onNavigateAuth('login')}
                  className="text-sm font-medium text-slate-700 hover:text-[#198F90] dark:text-slate-300 dark:hover:text-[#20B4B6] transition-colors whitespace-nowrap shrink-0 px-2 py-2"
                >
                  Login
                </button>
                <motion.button
                  whileHover={{ y: -1, scale: 1.02 }}
                  whileTap={{ scale: 0.96 }}
                  transition={SPRING_POP}
                  onClick={() => onNavigateAuth('register-student')}
                  className="btn-glossy-teal inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-bold whitespace-nowrap shrink-0"
                >
                  Get Started
                </motion.button>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 dark:border-slate-800 dark:text-slate-200"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden overflow-hidden border-t border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-[#071118]"
            >
              <div className="flex flex-col gap-3 text-sm font-medium">
                <a href="#home" onClick={() => setMobileMenuOpen(false)} className="py-1.5 text-slate-700 dark:text-slate-200">
                  Home
                </a>
                <a href="#features" onClick={() => setMobileMenuOpen(false)} className="py-1.5 text-slate-700 dark:text-slate-200">
                  Features
                </a>
                <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)} className="py-1.5 text-slate-700 dark:text-slate-200">
                  How It Works
                </a>
                <a href="#about" onClick={() => setMobileMenuOpen(false)} className="py-1.5 text-slate-700 dark:text-slate-200">
                  About
                </a>
                <a href="#contact" onClick={() => setMobileMenuOpen(false)} className="py-1.5 text-slate-700 dark:text-slate-200">
                  Contact
                </a>
                <div className="mt-2 flex flex-wrap items-center gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                  {user ? (
                    <button
                      onClick={onOpenPortal}
                      className="btn-glossy-teal w-full rounded-full px-4 py-2.5 text-sm font-bold"
                    >
                      Open Dashboard
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => onNavigateAuth('login')}
                        className="flex-1 rounded-full border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-800 dark:border-slate-700 dark:text-slate-200"
                      >
                        Login
                      </button>
                      <button
                        onClick={() => onNavigateAuth('register-student')}
                        className="btn-glossy-teal flex-1 rounded-full px-4 py-2.5 text-sm font-bold"
                      >
                        Get Started
                      </button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-b from-white via-teal-50/25 to-slate-50 dark:border-slate-800 dark:from-[#071118] dark:via-[#091D24] dark:to-[#071118]">
        <div className="mx-auto max-w-7xl px-6 py-16 lg:py-22">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center">
              <p className="text-sm font-semibold text-[#198F90] dark:text-[#20B4B6]">
                CareerMatch · Connecting Talent with Opportunity
              </p>
              <h1 className="mt-4 text-balance text-4xl font-extrabold tracking-tight text-slate-950 dark:text-white sm:text-5xl lg:text-[3.25rem] lg:leading-[1.08]">
                Your Skills. Your Future. Your Perfect Match.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 dark:text-slate-300 sm:text-lg">
                Discover opportunities, improve your career and connect with the right employers through intelligent AI-powered recruitment.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3.5">
                <motion.button
                  whileHover={{ y: -2, scale: 1.03 }}
                  whileTap={{ scale: 0.96 }}
                  transition={SPRING_POP}
                  onClick={() => (user ? onOpenPortal() : onNavigateAuth('register-student'))}
                  className="btn-glossy-teal inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold whitespace-nowrap shrink-0"
                >
                  Get Started
                  <ArrowRight className="h-4 w-4" />
                </motion.button>
                <motion.a
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  transition={SPRING_POP}
                  href="#features"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:border-[#1EA8A9] hover:text-[#198F90] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-[#20B4B6] transition-colors whitespace-nowrap shrink-0"
                >
                  Explore Features
                </motion.a>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <motion.button
                  whileHover={{ y: -2, scale: 1.02 }}
                  whileTap={{ scale: 0.96 }}
                  transition={SPRING_POP}
                  onClick={() => (user ? onOpenPortal() : onNavigateAuth('register-student'))}
                  className="inline-flex items-center gap-2 rounded-full border border-[#1EA8A9]/40 bg-teal-50/70 px-4 py-2 text-xs font-semibold text-[#0D595A] hover:bg-teal-100/80 dark:border-[#20B4B6]/40 dark:bg-teal-950/50 dark:text-teal-200 transition-colors whitespace-nowrap shrink-0"
                >
                  I&apos;m a Student
                </motion.button>
                <motion.button
                  whileHover={{ y: -2, scale: 1.02 }}
                  whileTap={{ scale: 0.96 }}
                  transition={SPRING_POP}
                  onClick={() => (user ? onOpenPortal() : onNavigateAuth('register-recruiter'))}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/90 px-4 py-2 text-xs font-semibold text-slate-800 hover:border-[#1EA8A9] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0"
                >
                  I&apos;m a Recruiter
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.95 }}
                  type="button"
                  onClick={toggleTheme}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-950 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 transition-colors whitespace-nowrap shrink-0"
                >
                  {theme === 'light' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
                  {theme === 'light' ? 'Dark mode' : 'Light mode'}
                </motion.button>
              </div>
            </div>

            {/* Interactive Dashboard Preview with Spring Pop-Up Transitions */}
            <div className="lg:col-span-6">
              <motion.div
                initial={{ opacity: 0.92, y: 12, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={SPRING_POP}
                className="surface-specular-card flex h-full flex-col justify-between rounded-2xl border border-[#1EA8A9]/30 bg-white/95 p-5 backdrop-blur-sm dark:border-[#20B4B6]/30 dark:bg-slate-900/90"
              >
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
                    <div>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        Interactive Workspace Preview · Demonstration Data
                      </p>
                      <h2 className="text-base font-semibold text-slate-950 dark:text-white">
                        {previewTab === 'resume' && 'AI Resume Quality & Skill Extraction'}
                        {previewTab === 'ranking' && 'Blind Candidate Screening & Ranking'}
                        {previewTab === 'matching' && 'Explainable Job Compatibility Matrix'}
                      </h2>
                    </div>

                    <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1 dark:bg-slate-800">
                      {[
                        { id: 'resume', label: 'Resume Score' },
                        { id: 'ranking', label: 'Blind Ranking' },
                        { id: 'matching', label: 'Explainable AI' },
                      ].map((tab) => {
                        const active = previewTab === tab.id;
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setPreviewTab(tab.id as 'resume' | 'ranking' | 'matching')}
                            className={`relative rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                              active
                                ? 'btn-glossy-teal'
                                : 'text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'
                            }`}
                          >
                            {tab.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <AnimatePresence mode="wait">
                    {previewTab === 'resume' && (
                      <motion.div
                        key="preview-resume"
                        initial={{ opacity: 0, y: 10, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.98 }}
                        transition={SPRING_POP}
                        className="mt-5 space-y-4"
                      >
                        <div className="flex items-baseline justify-between">
                          <div>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Maya_Nair_Resume_v2.pdf · Extracted 13 technical skills</p>
                            <p className="mt-1 text-2xl font-bold tabular-nums text-[#198F90] dark:text-[#20B4B6]">
                              89 / 100 <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Ready for ML Roles</span>
                            </p>
                          </div>
                          <span className="font-mono text-xs text-slate-500 dark:text-slate-400">+18 pts vs v1</span>
                        </div>

                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          {[
                            { label: 'Technical Skills', val: 92 },
                            { label: 'Experience', val: 85 },
                            { label: 'Education', val: 94 },
                            { label: 'Projects', val: 90 },
                            { label: 'Formatting', val: 88 },
                            { label: 'Readability', val: 86 },
                          ].map((m, idx) => (
                            <motion.div
                              key={m.label}
                              initial={{ opacity: 0, scale: 0.94 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ ...SPRING_POP, delay: idx * 0.04 }}
                              whileHover={{ y: -3, scale: 1.02 }}
                              className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
                            >
                              <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                                <span>{m.label}</span>
                                <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">{m.val}%</span>
                              </div>
                              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${m.val}%` }}
                                  transition={{ duration: 0.65, delay: 0.1 + idx * 0.05, ease: [0.16, 1, 0.3, 1] }}
                                  className="bar-glossy-teal h-2 rounded-full"
                                />
                              </div>
                            </motion.div>
                          ))}
                        </div>

                        <div className="rounded-xl border border-[#1EA8A9]/25 bg-teal-50/40 p-3.5 text-xs leading-relaxed text-slate-700 dark:border-[#20B4B6]/25 dark:bg-slate-950 dark:text-slate-300">
                          <span className="font-semibold text-slate-900 dark:text-white">Improvement Comparison: </span>
                          Replaced &ldquo;Built a job matcher app&rdquo; with &ldquo;Architected an explainable semantic skill-matching engine combining TF-IDF and dense embeddings.&rdquo;
                        </div>
                      </motion.div>
                    )}

                    {previewTab === 'ranking' && (
                      <motion.div
                        key="preview-ranking"
                        initial={{ opacity: 0, y: 10, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.98 }}
                        transition={SPRING_POP}
                        className="mt-5 space-y-3"
                      >
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Role: Junior Machine Learning Engineer · Names &amp; contact details masked during screening
                        </p>
                        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                          <table className="w-full text-left text-xs">
                            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                              <tr>
                                <th className="px-3.5 py-2.5 font-medium">Anonymized ID</th>
                                <th className="px-3.5 py-2.5 font-medium text-right">Match</th>
                                <th className="px-3.5 py-2.5 font-medium text-right">Skills</th>
                                <th className="px-3.5 py-2.5 font-medium">Missing</th>
                                <th className="px-3.5 py-2.5 font-medium">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                              <tr>
                                <td className="px-3.5 py-2.5 font-mono font-semibold text-slate-900 dark:text-white">Candidate #CM-4821</td>
                                <td className="px-3.5 py-2.5 text-right font-mono font-semibold tabular-nums text-[#198F90] dark:text-[#20B4B6]">93%</td>
                                <td className="px-3.5 py-2.5 text-right font-mono tabular-nums">96%</td>
                                <td className="px-3.5 py-2.5 text-slate-500">None</td>
                                <td className="px-3.5 py-2.5 font-semibold text-emerald-700 dark:text-emerald-400">Shortlisted</td>
                              </tr>
                              <tr>
                                <td className="px-3.5 py-2.5 font-mono font-semibold text-slate-900 dark:text-white">Candidate #CM-7394</td>
                                <td className="px-3.5 py-2.5 text-right font-mono font-semibold tabular-nums text-slate-800 dark:text-slate-200">74%</td>
                                <td className="px-3.5 py-2.5 text-right font-mono tabular-nums">68%</td>
                                <td className="px-3.5 py-2.5 text-slate-500">NLP, PyTorch</td>
                                <td className="px-3.5 py-2.5 font-medium text-slate-600 dark:text-slate-400">Screening</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Human recruiters control shortlisting and can manually edit extracted skills before recalculating rank.
                        </p>
                      </motion.div>
                    )}

                    {previewTab === 'matching' && (
                      <motion.div
                        key="preview-matching"
                        initial={{ opacity: 0, y: 10, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.98 }}
                        transition={SPRING_POP}
                        className="mt-5 space-y-3"
                      >
                        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-slate-900 dark:text-white">Score Explanation · Candidate #CM-4821</span>
                            <span className="font-mono text-sm font-bold tabular-nums text-[#198F90] dark:text-[#20B4B6]">93% Overall</span>
                          </div>
                          <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                            Weighted formula: Technical Skills (55% × 96) + Relevant Experience (25% × 88) + Education (20% × 95).
                          </p>
                          <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                              <Check className="h-3.5 w-3.5 shrink-0" />
                              <span>Semantic Match: &ldquo;Natural Language Processing&rdquo; recognized as 100% equivalent to &ldquo;NLP&rdquo;</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                              <Check className="h-3.5 w-3.5 shrink-0 text-[#198F90]" />
                              <span>Relevant Project: SkillGraph Semantic Matcher aligns directly with role requirements</span>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-slate-200 pt-3.5 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <span>Transparent AI · Human-in-the-Loop Decisions</span>
                  <button
                    onClick={() => onNavigateAuth('login')}
                    className="font-semibold text-[#198F90] hover:underline dark:text-[#20B4B6]"
                  >
                    Try Live Demo Accounts →
                  </button>
                </div>
              </motion.div>
            </div>
          </div>

          {/* Live Platform Statistics Strip */}
          <div className="mt-12 grid grid-cols-2 gap-6 border-t border-slate-200 pt-8 sm:grid-cols-4 dark:border-slate-800">
            {[
              { val: `${stats ? stats.analyses : 2}+`, label: 'Resumes Analyzed with Explainable Rubrics' },
              { val: `${stats ? stats.activeJobs : 4}`, label: 'Active Job Openings Ready to Match' },
              { val: `${stats ? stats.avgMatchAccuracy : 94}%`, label: 'Semantic Skill Synonym Coverage' },
              { val: '100%', label: 'Blind Screening PII Masking Default' },
            ].map((item, idx) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ ...SPRING_POP, delay: idx * 0.06 }}
              >
                <p className="text-2xl font-bold tabular-nums text-slate-950 dark:text-white">{item.val}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How CareerMatch Works */}
      <section id="how-it-works" className="mx-auto max-w-7xl px-6 py-18">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-[#198F90] dark:text-[#20B4B6]">How CareerMatch Works</p>
          <h2 className="mt-2 text-balance text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
            Structured workflows from resume upload to fair hiring
          </h2>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[
            {
              num: '01.',
              title: 'Extract & Normalize Skills',
              body: 'Upload PDF or DOCX resumes. CareerMatch extracts education, experience, and projects while normalizing synonyms like ML, NLP, and JS.',
            },
            {
              num: '02.',
              title: 'Score & Improve Quality',
              body: 'Students receive a 6-dimension rubric score, side-by-side bullet rewrites, missing-skill alerts, and version comparison.',
            },
            {
              num: '03.',
              title: 'Blind Screening & Ranking',
              body: 'Recruiters bulk-upload candidate files, detect duplicates automatically, and review ranked matches with identities masked.',
            },
            {
              num: '04.',
              title: 'Roadmap & Interview Prep',
              body: 'Candidates close skill gaps through sequenced learning milestones and practice with tailored technical and HR interview feedback.',
            },
          ].map((step, idx) => (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, amount: 0.15 }}
              whileHover={{ y: -5, scale: 1.02 }}
              transition={{ ...SPRING_POP, delay: idx * 0.06 }}
              className="surface-specular-card rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
            >
              <p className="font-mono text-sm font-bold text-[#198F90] dark:text-[#20B4B6]">{step.num}</p>
              <h3 className="mt-3 text-lg font-semibold text-slate-950 dark:text-white">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{step.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Student & Recruiter Benefits + AI Features (Asymmetric Bento) */}
      <section id="features" className="border-y border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/40">
        <div className="mx-auto max-w-7xl px-6 py-18">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={SPRING_POP}
              className="surface-specular-card lg:col-span-5 flex flex-col justify-between rounded-2xl border border-[#1EA8A9]/30 bg-slate-50 p-7 dark:border-[#20B4B6]/30 dark:bg-slate-900"
            >
              <div>
                <div className="bg-glossy-teal inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#198F90] text-[#042022] shadow-sm">
                  <Target className="h-5 w-5" />
                </div>
                <h2 className="mt-5 text-2xl font-bold text-slate-950 dark:text-white">For Students &amp; Job Seekers</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  Turn generic resumes into evidence-backed applications and follow a structured learning sequence for your target career.
                </p>
                <ul className="mt-6 space-y-3 text-sm text-slate-700 dark:text-slate-300">
                  <li className="flex items-start gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#198F90] dark:text-[#20B4B6]" />
                    <span>6-dimension resume scoring with transparent rubric formulas</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#198F90] dark:text-[#20B4B6]" />
                    <span>Original vs. improved bullet comparisons and version diffing</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#198F90] dark:text-[#20B4B6]" />
                    <span>Skill Gap Analyzer, Career Roadmap milestones &amp; Interview Simulator</span>
                  </li>
                </ul>
              </div>
              <div className="mt-8">
                <motion.button
                  whileHover={{ y: -2, scale: 1.02 }}
                  whileTap={{ scale: 0.96 }}
                  transition={SPRING_POP}
                  onClick={() => onNavigateAuth('register-student')}
                  className="btn-glossy-teal inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold"
                >
                  Create Student Account
                  <ArrowRight className="h-4 w-4" />
                </motion.button>
              </div>
            </motion.div>

            <div className="lg:col-span-7 grid grid-cols-1 gap-6 sm:grid-cols-2">
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.97 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, amount: 0.15 }}
                whileHover={{ y: -4 }}
                transition={{ ...SPRING_POP, delay: 0.05 }}
                className="surface-specular-card sm:col-span-2 rounded-2xl border border-slate-200 bg-white p-7 dark:border-slate-800 dark:bg-slate-950"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-bold text-slate-950 dark:text-white">For Recruiters &amp; Hiring Teams</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                      Generate structured job descriptions, bulk-screen PDF/DOCX batches with automatic duplicate detection, and inspect every candidate score breakdown without hidden black-box rankings.
                    </p>
                  </div>
                  <Users className="h-6 w-6 shrink-0 text-[#198F90] dark:text-[#20B4B6]" />
                </div>
                <div className="mt-5 grid grid-cols-1 gap-3 border-t border-slate-100 pt-5 sm:grid-cols-3 dark:border-slate-800">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">Explainable Scoring</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Matched, partial, and missing skills shown per candidate.</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">Blind Screening Mode</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Masks names &amp; contact info until human shortlisting.</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">Manual Skill Edits</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Recruiters can correct extracted skills and recalculate live.</p>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.97 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, amount: 0.15 }}
                whileHover={{ y: -4, scale: 1.01 }}
                transition={{ ...SPRING_POP, delay: 0.1 }}
                className="surface-specular-card rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950"
              >
                <FileText className="h-5 w-5 text-[#198F90] dark:text-[#20B4B6]" />
                <h4 className="mt-3 text-base font-semibold text-slate-950 dark:text-white">Semantic Skill Matching</h4>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  Connects equivalent terms (ML ↔ Machine Learning, JS ↔ JavaScript, K8s ↔ Kubernetes) so qualified candidates are never filtered out by phrasing.
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.97 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, amount: 0.15 }}
                whileHover={{ y: -4, scale: 1.01 }}
                transition={{ ...SPRING_POP, delay: 0.14 }}
                className="surface-specular-card rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950"
              >
                <Layers className="h-5 w-5 text-[#198F90] dark:text-[#20B4B6]" />
                <h4 className="mt-3 text-base font-semibold text-slate-950 dark:text-white">Resume Version Diff &amp; Dedup</h4>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  Compare resume iterations side by side to measure score gains, while SHA-256 hashing flags duplicate uploads across bulk batches.
                </p>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* Intelligent Job Matching Live Preview + Workspace Photography */}
      <section className="mx-auto max-w-7xl px-6 py-18">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-stretch">
          <div className="lg:col-span-5">
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={SPRING_POP}
              className="h-full min-h-[280px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900"
            >
              {!heroImgFailed ? (
                <img
                  src="/src/assets/images/hero_talent_workspace_1794547886052.jpg"
                  alt="Modern engineering and recruitment collaboration workspace"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgFailed(true)}
                  className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                />
              ) : (
                <div className="flex h-full min-h-[280px] flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-teal-50 p-8 text-center dark:from-slate-900 dark:to-slate-800">
                  <ShieldCheck className="h-10 w-10 text-[#198F90] dark:text-[#20B4B6]" />
                  <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">CareerMatch Recruitment Environment</p>
                </div>
              )}
            </motion.div>
          </div>

          <div className="lg:col-span-7 flex flex-col justify-between">
            <div>
              <p className="text-sm font-semibold text-[#198F90] dark:text-[#20B4B6]">Intelligent Job Matching</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
                Live Active Opportunities
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Sign in as a student to see real-time AI compatibility percentages and skill-gap indicators on every opening.
              </p>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {jobs.slice(0, 4).map((job, idx) => (
                <motion.div
                  key={job.id}
                  initial={{ opacity: 0, y: 16, scale: 0.96 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true, amount: 0.15 }}
                  whileHover={{ y: -4, scale: 1.015 }}
                  transition={{ ...SPRING_POP, delay: idx * 0.05 }}
                  className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div>
                    <h3 className="text-sm font-semibold text-slate-950 dark:text-white">{job.title}</h3>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {job.company} · {job.job_type}
                    </p>
                    <p className="mt-2 flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                      <MapPin className="h-3.5 w-3.5 text-[#198F90]" />
                      <span>{job.location}</span>
                    </p>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      Skills: {job.requiredSkills.slice(0, 4).join(' · ')}
                    </p>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                    <span className="font-mono font-medium text-slate-700 dark:text-slate-300">{job.salary_range || 'Competitive'}</span>
                    <button
                      onClick={() => (user ? onOpenPortal() : onNavigateAuth('login'))}
                      className="font-semibold text-[#198F90] hover:underline dark:text-[#20B4B6]"
                    >
                      Check Match →
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="border-y border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/40">
        <div className="mx-auto max-w-7xl px-6 py-18">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-[#198F90] dark:text-[#20B4B6]">Verified Outcomes</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
              Built for transparent hiring and measurable career readiness
            </h2>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
            {[
              {
                name: 'Maya Nair',
                role: 'Computer Science Graduate, UC Berkeley',
                avatar: '/src/assets/images/avatar_student_maya_1794547887471.jpg',
                quote:
                  'Before CareerMatch, my resume scored 71/100 because my project bullets omitted metrics. After applying the comparison rewrites and closing two skill gaps, my score rose to 89 and I landed two ML interviews.',
              },
              {
                name: 'David Chen',
                role: 'Senior Technical Talent Partner, Northstar Systems',
                avatar: '/src/assets/images/avatar_recruiter_david_1794547887906.jpg',
                quote:
                  'Bulk screening 40+ PDFs used to take an afternoon. Blind screening plus explainable skill breakdowns cut our initial triage time by 60% while keeping every hiring decision strictly human-led.',
              },
              {
                name: 'Priya Kapoor',
                role: 'Director of Engineering Talent, Meridian Labs',
                avatar: '/src/assets/images/avatar_lead_priya_1794547887253.jpg',
                quote:
                  'Recognizing semantic synonyms like ML and Natural Language Processing surfaced qualified graduates our legacy keyword filter missed completely.',
              },
            ].map((t, idx) => (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, y: 18, scale: 0.96 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, amount: 0.15 }}
                whileHover={{ y: -4 }}
                transition={{ ...SPRING_POP, delay: idx * 0.06 }}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/70 p-6 dark:border-slate-800 dark:bg-slate-950"
              >
                <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">&ldquo;{t.quote}&rdquo;</p>
                <div className="mt-6 flex items-center gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                  <img
                    src={t.avatar}
                    alt={t.name}
                    referrerPolicy="no-referrer"
                    className="h-10 w-10 rounded-full object-cover border border-[#1EA8A9]/40"
                  />
                  <div>
                    <p className="text-sm font-semibold text-slate-950 dark:text-white">{t.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t.role}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* About Fair Recruitment & FAQ */}
      <section id="about" className="mx-auto max-w-7xl px-6 py-18">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className="text-sm font-semibold text-[#198F90] dark:text-[#20B4B6]">About CareerMatch</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
              Fair, explainable AI recruitment by design
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              CareerMatch combines structured NLP parsing, semantic skill matching, and human-in-the-loop accountability. We exclude age, gender, religion, and photographs from ranking calculations and require transparent evidence for every compatibility score.
            </p>
            <div className="mt-6 space-y-3 rounded-2xl border border-slate-200 bg-white p-5 text-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-2.5 font-medium text-slate-900 dark:text-white">
                <ShieldCheck className="h-4 w-4 text-[#198F90] dark:text-[#20B4B6]" />
                <span>Blind initial screening masks PII automatically</span>
              </div>
              <div className="flex items-center gap-2.5 font-medium text-slate-900 dark:text-white">
                <ShieldCheck className="h-4 w-4 text-[#198F90] dark:text-[#20B4B6]" />
                <span>Recruiters can inspect and correct extracted skills</span>
              </div>
              <div className="flex items-center gap-2.5 font-medium text-slate-900 dark:text-white">
                <ShieldCheck className="h-4 w-4 text-[#198F90] dark:text-[#20B4B6]" />
                <span>Full user control over resume &amp; account deletion</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7">
            <h3 className="text-xl font-bold text-slate-950 dark:text-white">Frequently Asked Questions</h3>
            <div className="mt-4 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
              {FAQS.map((item, idx) => {
                const isOpen = openFaq === idx;
                return (
                  <div key={item.q}>
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? null : idx)}
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold text-slate-900 dark:text-white"
                    >
                      <span>{item.q}</span>
                      <ChevronDown className={`h-4 w-4 shrink-0 text-[#198F90] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="px-5 pb-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                            {item.a}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/50">
        <div className="mx-auto max-w-7xl px-6 py-16">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <p className="text-sm font-semibold text-[#198F90] dark:text-[#20B4B6]">Contact</p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">
                Partner with CareerMatch for campus &amp; enterprise hiring
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                Questions about university career centers, recruiter integrations, or fairness audits? Send a message directly to our team.
              </p>
            </div>

            <form onSubmit={handleContactSubmit} className="lg:col-span-7 space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-6 dark:border-slate-800 dark:bg-slate-950">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Full Name</label>
                  <input
                    type="text"
                    required
                    value={contactForm.name}
                    onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Jordan Lee"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-[#1EA8A9] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Email Address</label>
                  <input
                    type="email"
                    required
                    value={contactForm.email}
                    onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="jordan@university.edu"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-[#1EA8A9] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Role</label>
                <select
                  value={contactForm.role}
                  onChange={(e) => setContactForm((f) => ({ ...f, role: e.target.value }))}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-[#1EA8A9] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  <option value="Student">Student / Job Seeker</option>
                  <option value="Recruiter">Recruiter / Hiring Manager</option>
                  <option value="University">University Career Services</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Message</label>
                <textarea
                  rows={3}
                  required
                  value={contactForm.message}
                  onChange={(e) => setContactForm((f) => ({ ...f, message: e.target.value }))}
                  placeholder="Tell us how we can help..."
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-[#1EA8A9] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>

              {contactState.error && <p className="text-xs font-medium text-red-600 dark:text-red-400">{contactState.error}</p>}
              {contactState.success && <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{contactState.success}</p>}

              <motion.button
                whileHover={{ y: -1, scale: 1.02 }}
                whileTap={{ scale: 0.96 }}
                transition={SPRING_POP}
                type="submit"
                disabled={contactState.loading}
                className="btn-glossy-teal rounded-full px-6 py-2.5 text-sm font-bold disabled:opacity-60"
              >
                {contactState.loading ? 'Sending...' : 'Send Message'}
              </motion.button>
            </form>
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-[#071118]">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-6 py-8 sm:flex-row sm:items-center">
          <div>
            <BrandLogo size="sm" />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Connecting Talent with Opportunity · AI for Everyday Life
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-xs text-slate-500 dark:text-slate-400">
            <a href="#features" className="hover:text-[#198F90] dark:hover:text-[#20B4B6]">Features</a>
            <a href="#how-it-works" className="hover:text-[#198F90] dark:hover:text-[#20B4B6]">How It Works</a>
            <a href="#about" className="hover:text-[#198F90] dark:hover:text-[#20B4B6]">Fair AI</a>
            <button onClick={() => onNavigateAuth('login')} className="hover:text-[#198F90] dark:hover:text-[#20B4B6]">Portal Login</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
