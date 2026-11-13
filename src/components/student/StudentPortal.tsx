import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowRight,
  Bookmark,
  Briefcase,
  Check,
  CheckCircle2,
  Compass,
  FileSearch,
  FileText,
  GitCompare,
  LayoutDashboard,
  MessageSquare,
  Search,
  Sparkles,
  Target,
  Trash2,
  Upload,
} from 'lucide-react';
import { PortalLayout, NavItem } from '../PortalLayout';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../lib/api';
import { ExplainableMatch, JobListing, ResumeRecord } from '../../types';
import { ResumeUploadResult, ResumeUploadZone } from './ResumeUploadZone';

interface StudentPortalProps {
  onGoHome: () => void;
}

interface DashboardData {
  profileCompletion: number;
  latestResumeScore: number | null;
  latestAnalysis: ResumeRecord | null;
  totalResumesAnalyzed: number;
  recommendedJobs: Array<{
    id: number;
    title: string;
    company: string;
    location: string;
    job_type: string;
    salary_range: string;
    matchScore: number;
    matchedSkills: string[];
    missingSkills: string[];
  }>;
  applications: Array<{
    id: number;
    job_title: string;
    company: string;
    location: string;
    status: string;
    match_score: number;
    updated_at: string;
  }>;
  roadmap: {
    id: number;
    target_role: string;
    progress_percent: number;
    milestones: Array<{ id: string; title: string; completed?: boolean }>;
  } | null;
  interviews: Array<{ id: number; role_title: string; mode: string; created_at: string }>;
  activities: Array<{ id: number; details: string; created_at: string }>;
}

export function StudentPortal({ onGoHome }: StudentPortalProps) {
  const { user, refreshMe } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [resumes, setResumes] = useState<ResumeRecord[]>([]);
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [applications, setApplications] = useState<Array<Record<string, unknown>>>([]);
  const [roadmaps, setRoadmaps] = useState<Array<Record<string, unknown>>>([]);
  const [interviews, setInterviews] = useState<Array<Record<string, unknown>>>([]);

  // Analyzer state
  const [selectedResumeId, setSelectedResumeId] = useState<number | null>(null);
  const [targetRoleInput, setTargetRoleInput] = useState('Machine Learning Engineer');
  const [pasteText, setPasteText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzerMsg, setAnalyzerMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [compareA, setCompareA] = useState<number>(0);
  const [compareB, setCompareB] = useState<number>(0);
  const [compareResult, setCompareResult] = useState<{
    scoreDelta: number;
    addedSkills: string[];
    removedSkills: string[];
    retainedSkills: string[];
    versionA: ResumeRecord;
    versionB: ResumeRecord;
  } | null>(null);

  // Jobs filter state
  const [jobQuery, setJobQuery] = useState('');
  const [jobSkill, setJobSkill] = useState('');
  const [jobLocation, setJobLocation] = useState('all');
  const [jobExp, setJobExp] = useState('all');
  const [jobType, setJobType] = useState('all');
  const [selectedJob, setSelectedJob] = useState<JobListing | null>(null);
  const [applyResumeId, setApplyResumeId] = useState<number | undefined>(undefined);
  const [jobActionMsg, setJobActionMsg] = useState('');

  // Skill Gap state
  const [gapJobId, setGapJobId] = useState<number | ''>('');
  const [customGapSkills, setCustomGapSkills] = useState('Python, Machine Learning, NLP, Docker, Kubernetes');
  const [gapResult, setGapResult] = useState<(ExplainableMatch & { roleTitle: string; studentSkills: string[]; requiredSkills: string[]; learningPriorities: Array<{ skill: string; priority: string; estimatedStudyHours: number; rationale: string }> }) | null>(null);
  const [gapLoading, setGapLoading] = useState(false);

  // Roadmap state
  const [roadmapRole, setRoadmapRole] = useState('Machine Learning Engineer');
  const [roadmapLoading, setRoadmapLoading] = useState(false);

  // Interview state
  const [intRole, setIntRole] = useState('Junior Machine Learning Engineer');
  const [intMode, setIntMode] = useState('technical');
  const [intJobId, setIntJobId] = useState<number | ''>('');
  const [intLoading, setIntLoading] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [submittingAnswerKey, setSubmittingAnswerKey] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [dash, resList, appList, rmList, intList] = await Promise.all([
        apiRequest<DashboardData>('/api/student/dashboard'),
        apiRequest<ResumeRecord[]>('/api/student/resumes'),
        apiRequest<Array<Record<string, unknown>>>('/api/student/applications'),
        apiRequest<Array<Record<string, unknown>>>('/api/student/roadmaps'),
        apiRequest<Array<Record<string, unknown>>>('/api/student/interviews'),
      ]);
      setDashboard(dash);
      setResumes(resList);
      setApplications(appList);
      setRoadmaps(rmList);
      setInterviews(intList);
      if (resList.length > 0 && !selectedResumeId) setSelectedResumeId(resList[0].id);
      if (resList.length >= 2 && !compareA && !compareB) {
        setCompareA(resList[resList.length - 1].id);
        setCompareB(resList[0].id);
      }
      if (intList.length > 0 && !activeSessionId) {
        setActiveSessionId(Number(intList[0].id));
      }
    } catch {
      // handled per view
    }
  }, [selectedResumeId, compareA, compareB, activeSessionId]);

  const loadJobs = useCallback(async () => {
    const params = new URLSearchParams();
    if (jobQuery) params.set('q', jobQuery);
    if (jobSkill) params.set('skill', jobSkill);
    if (jobLocation !== 'all') params.set('location', jobLocation);
    if (jobExp !== 'all') params.set('experience', jobExp);
    if (jobType !== 'all') params.set('jobType', jobType);
    const list = await apiRequest<JobListing[]>(`/api/jobs?${params.toString()}`);
    setJobs(list);
    if (list.length > 0 && !selectedJob) setSelectedJob(list[0]);
  }, [jobQuery, jobSkill, jobLocation, jobExp, jobType, selectedJob]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    loadJobs().catch(() => {});
  }, [loadJobs]);

  const navItems: NavItem[] = [
    { id: 'overview', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
    { id: 'analyzer', label: 'AI Resume Analyzer', icon: <FileSearch className="h-4 w-4" /> },
    { id: 'jobs', label: 'Job Portal', icon: <Briefcase className="h-4 w-4" /> },
    { id: 'skill-gap', label: 'Skill Gap Analyzer', icon: <Target className="h-4 w-4" /> },
    { id: 'roadmap', label: 'AI Career Roadmap', icon: <Compass className="h-4 w-4" /> },
    { id: 'interview', label: 'Interview Prep', icon: <MessageSquare className="h-4 w-4" /> },
    { id: 'applications', label: 'Applications', icon: <FileText className="h-4 w-4" /> },
  ];

  const handleUploadComplete = async (result: ResumeUploadResult) => {
    setSelectedResumeId(result.resumeId);
    setAnalyzerMsg({
      type: 'ok',
      text: `Analyzed "${result.filename}" (${result.overallScore}/100 via ${result.aiProvider === 'gemini' ? 'Gemini 4 Hydrogen' : 'Local NLP Fallback'}).${result.isDuplicate ? ` Duplicate content matched "${result.duplicateOf}".` : ''}`,
    });
    await loadAll();
    await refreshMe();
  };

  const handleAnalyzeText = async (e: React.FormEvent) => {
    e.preventDefault();
    setAnalyzing(true);
    setAnalyzerMsg(null);
    try {
      const result = await apiRequest<{ resumeId: number; overallScore: number; aiProvider: string; fallbackNotice?: string }>(
        '/api/student/resumes/analyze',
        {
          method: 'POST',
          body: JSON.stringify({ rawText: pasteText, targetRole: targetRoleInput }),
        }
      );
      setSelectedResumeId(result.resumeId);
      setPasteText('');
      setAnalyzerMsg({
        type: 'ok',
        text: `Analysis complete (${result.overallScore}/100 via ${result.aiProvider === 'gemini' ? 'Gemini 4 Hydrogen' : 'Local NLP Fallback'}).`,
      });
      await loadAll();
      await refreshMe();
    } catch (err) {
      setAnalyzerMsg({ type: 'err', text: err instanceof Error ? err.message : 'Analysis failed.' });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDeleteResume = async (id: number) => {
    await apiRequest(`/api/student/resumes/${id}`, { method: 'DELETE' });
    if (selectedResumeId === id) setSelectedResumeId(null);
    await loadAll();
  };

  const handleCompareVersions = async () => {
    if (!compareA || !compareB) return;
    const data = await apiRequest<{
      scoreDelta: number;
      addedSkills: string[];
      removedSkills: string[];
      retainedSkills: string[];
      versionA: ResumeRecord;
      versionB: ResumeRecord;
    }>(`/api/student/resumes/compare?a=${compareA}&b=${compareB}`);
    setCompareResult(data);
  };

  const handleSaveJob = async (jobId: number) => {
    await apiRequest(`/api/jobs/${jobId}/save`, { method: 'POST' });
    await loadJobs();
  };

  const handleApplyJob = async (jobId: number) => {
    setJobActionMsg('');
    try {
      const res = await apiRequest<{ anonymizedCode: string; match: ExplainableMatch }>(`/api/jobs/${jobId}/apply`, {
        method: 'POST',
        body: JSON.stringify({ resumeId: applyResumeId }),
      });
      setJobActionMsg(`Application submitted (${res.match.overallMatch}% match · Blind ID #${res.anonymizedCode}).`);
      await loadJobs();
      await loadAll();
    } catch (err) {
      setJobActionMsg(err instanceof Error ? err.message : 'Could not apply.');
    }
  };

  const handleWithdrawApp = async (appId: number) => {
    await apiRequest(`/api/student/applications/${appId}/withdraw`, { method: 'POST' });
    await loadAll();
    await loadJobs();
  };

  const handleRunSkillGap = async (e: React.FormEvent) => {
    e.preventDefault();
    setGapLoading(true);
    try {
      const res = await apiRequest<typeof gapResult>('/api/student/skill-gap', {
        method: 'POST',
        body: JSON.stringify(
          gapJobId
            ? { jobId: Number(gapJobId) }
            : { customSkills: customGapSkills.split(',').map((s) => s.trim()).filter(Boolean) }
        ),
      });
      setGapResult(res);
    } finally {
      setGapLoading(false);
    }
  };

  const handleGenerateRoadmap = async (e: React.FormEvent) => {
    e.preventDefault();
    setRoadmapLoading(true);
    try {
      await apiRequest('/api/student/roadmaps/generate', {
        method: 'POST',
        body: JSON.stringify({ targetRole: roadmapRole }),
      });
      await loadAll();
    } finally {
      setRoadmapLoading(false);
    }
  };

  const handleToggleMilestone = async (roadmapId: number, milestoneId: string, completed: boolean) => {
    await apiRequest(`/api/student/roadmaps/${roadmapId}/milestone`, {
      method: 'PATCH',
      body: JSON.stringify({ milestoneId, completed }),
    });
    await loadAll();
  };

  const handleGenerateInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    setIntLoading(true);
    try {
      const created = await apiRequest<{ id: number }>('/api/student/interviews/generate', {
        method: 'POST',
        body: JSON.stringify({ roleTitle: intRole, mode: intMode, jobId: intJobId || undefined }),
      });
      setActiveSessionId(created.id);
      await loadAll();
    } finally {
      setIntLoading(false);
    }
  };

  const handleSubmitAnswer = async (sessionId: number, qIdx: number, qText: string) => {
    const key = `${sessionId}-${qIdx}`;
    const answer = answerDrafts[key] || '';
    if (answer.trim().length < 10) return;
    setSubmittingAnswerKey(key);
    try {
      await apiRequest(`/api/student/interviews/${sessionId}/answer`, {
        method: 'POST',
        body: JSON.stringify({ questionIndex: qIdx, questionText: qText, userAnswer: answer }),
      });
      setAnswerDrafts((d) => ({ ...d, [key]: '' }));
      await loadAll();
    } finally {
      setSubmittingAnswerKey(null);
    }
  };

  const activeResume = resumes.find((r) => r.id === selectedResumeId) || resumes[0] || null;
  const activeSession = interviews.find((s) => Number(s.id) === activeSessionId) || interviews[0] || null;

  const scoreChartData = activeResume
    ? [
        { metric: 'Technical', score: activeResume.technical_score },
        { metric: 'Experience', score: activeResume.experience_score },
        { metric: 'Education', score: activeResume.education_score },
        { metric: 'Projects', score: activeResume.project_score },
        { metric: 'Formatting', score: activeResume.formatting_score },
        { metric: 'Readability', score: activeResume.readability_score },
      ]
    : [];

  return (
    <PortalLayout
      portalTitle="Student Portal"
      navItems={navItems}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onGoHome={onGoHome}
    >
      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-950 dark:text-white">
                Welcome back, {user?.full_name}
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Track resume quality, close skill gaps, and monitor live job compatibility.
              </p>
            </div>
            <button
              onClick={() => setActiveTab('analyzer')}
              className="btn-glossy-teal inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold"
            >
              <Upload className="h-3.5 w-3.5" />
              Analyze New Resume
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              whileHover={{ y: -3 }}
              transition={{ type: 'spring', stiffness: 360, damping: 24, delay: 0.03 }}
              className="surface-specular-card rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
            >
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Profile Completion</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-slate-950 dark:text-white">
                {dashboard?.profileCompletion ?? 0}%
              </p>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${dashboard?.profileCompletion ?? 0}%` }}
                  transition={{ duration: 0.65, ease: 'easeOut' }}
                  className="bar-glossy-teal h-2 rounded-full"
                />
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              whileHover={{ y: -3 }}
              transition={{ type: 'spring', stiffness: 360, damping: 24, delay: 0.08 }}
              className="surface-specular-card rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
            >
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Latest Resume Score</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-[#198F90] dark:text-[#20B4B6]">
                {dashboard?.latestResumeScore !== null && dashboard?.latestResumeScore !== undefined
                  ? `${dashboard.latestResumeScore} / 100`
                  : 'Not analyzed'}
              </p>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Across 6 weighted quality dimensions</p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              whileHover={{ y: -3 }}
              transition={{ type: 'spring', stiffness: 360, damping: 24, delay: 0.13 }}
              className="surface-specular-card rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
            >
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Resumes Analyzed</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-slate-950 dark:text-white">
                {dashboard?.totalResumesAnalyzed ?? 0}
              </p>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Version history &amp; comparison active</p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              whileHover={{ y: -3 }}
              transition={{ type: 'spring', stiffness: 360, damping: 24, delay: 0.18 }}
              className="surface-specular-card rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
            >
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Roadmap Progress</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-[#198F90] dark:text-[#20B4B6]">
                {dashboard?.roadmap ? `${dashboard.roadmap.progress_percent}%` : '0%'}
              </p>
              <p className="mt-2 truncate text-xs text-slate-500 dark:text-slate-400">
                {dashboard?.roadmap?.target_role || 'Create a target roadmap'}
              </p>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Skill Breakdown Chart */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26, delay: 0.12 }}
              className="surface-specular-card lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-950 dark:text-white">Skill &amp; Resume Quality Breakdown</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Latest resume rubric performance</p>
                </div>
                <button onClick={() => setActiveTab('analyzer')} className="text-xs font-semibold text-[#198F90] hover:underline dark:text-[#20B4B6]">
                  Full Analysis →
                </button>
              </div>
              {scoreChartData.length > 0 ? (
                <div className="mt-4 h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={scoreChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="metric" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} />
                      <Tooltip />
                      <Bar dataKey="score" fill="#198F90" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="py-16 text-center text-sm text-slate-500">Upload a resume to visualize your score breakdown.</p>
              )}
            </motion.div>

            {/* Recommended Jobs */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26, delay: 0.18 }}
              className="surface-specular-card lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-950 dark:text-white">Recommended Jobs</h2>
                <button onClick={() => setActiveTab('jobs')} className="text-xs font-semibold text-[#198F90] hover:underline dark:text-[#20B4B6]">
                  Browse All →
                </button>
              </div>
              <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                {(dashboard?.recommendedJobs || []).map((job) => (
                  <div key={job.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{job.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {job.company} · {job.location}
                        </p>
                      </div>
                      <span className="font-mono text-xs font-bold tabular-nums text-[#198F90] dark:text-[#20B4B6]">
                        {job.matchScore}% match
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Recent Activities */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-base font-semibold text-slate-950 dark:text-white">Recent Activities</h2>
              <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                {(dashboard?.activities || []).length === 0 ? (
                  <p className="py-4 text-xs text-slate-500">No recent activities recorded.</p>
                ) : (
                  (dashboard?.activities || []).map((act) => (
                    <div key={act.id} className="flex items-center justify-between py-2.5 text-xs">
                      <span className="text-slate-700 dark:text-slate-300">{act.details}</span>
                      <span className="font-mono text-slate-400 shrink-0 ml-3">{act.created_at.slice(0, 10)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Interview Prep Summary */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-950 dark:text-white">Interview Preparation</h2>
                <button onClick={() => setActiveTab('interview')} className="text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400">
                  Practice Now →
                </button>
              </div>
              <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                {(dashboard?.interviews || []).length === 0 ? (
                  <p className="py-4 text-xs text-slate-500">Start an AI mock interview session tailored to your resume.</p>
                ) : (
                  (dashboard?.interviews || []).map((iv) => (
                    <div key={iv.id} className="flex items-center justify-between py-2.5 text-xs">
                      <span className="font-medium text-slate-800 dark:text-slate-200">{iv.role_title}</span>
                      <span className="text-slate-500 capitalize">{iv.mode} · {iv.created_at.slice(0, 10)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI RESUME ANALYZER, SCORING & IMPROVEMENT TAB */}
      {activeTab === 'analyzer' && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-950 dark:text-white">AI Resume Analyzer &amp; Improvement</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Upload PDF/DOCX files or paste text to extract structured skills, inspect 6 scoring dimensions, and compare bullet improvements.
            </p>
          </div>

          {/* Upload & Paste Area */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Target Role (Optional)</label>
                <input
                  type="text"
                  value={targetRoleInput}
                  onChange={(e) => setTargetRoleInput(e.target.value)}
                  placeholder="e.g., Machine Learning Engineer"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>

              <ResumeUploadZone
                targetRole={targetRoleInput}
                onUploadComplete={handleUploadComplete}
              />

              <form onSubmit={handleAnalyzeText} className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Or Paste Resume Text</label>
                <textarea
                  rows={4}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="Paste resume content here to run immediate NLP & AI evaluation..."
                  className="w-full rounded-lg border border-slate-300 bg-white p-3 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
                <button
                  type="submit"
                  disabled={analyzing || pasteText.trim().length < 30}
                  className="w-full rounded-lg border border-slate-300 bg-white py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  {analyzing ? 'Running Analysis...' : 'Analyze Pasted Text'}
                </button>
              </form>

              {analyzerMsg && (
                <p className={`text-xs font-medium ${analyzerMsg.type === 'ok' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {analyzerMsg.text}
                </p>
              )}
            </div>

            {/* Resume History Selector */}
            <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-base font-semibold text-slate-950 dark:text-white">Analyzed Resume Versions ({resumes.length})</h2>
              <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                {resumes.map((r) => (
                  <div
                    key={r.id}
                    className={`flex flex-wrap items-center justify-between gap-3 py-3 px-2 rounded-lg cursor-pointer transition-colors ${
                      activeResume?.id === r.id ? 'bg-blue-50/70 dark:bg-blue-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                    onClick={() => setSelectedResumeId(r.id)}
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        v{r.version_number} · {r.original_filename}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {r.created_at.slice(0, 10)} · {r.ai_provider === 'gemini' ? 'Gemini 4 Hydrogen' : 'Local NLP Engine'}
                        {r.is_duplicate ? ' · Duplicate Content Flagged' : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-bold tabular-nums text-[#0F2557] dark:text-blue-400">
                        {r.overall_score}/100
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteResume(r.id);
                        }}
                        aria-label="Delete resume"
                        className="p-1.5 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Version Comparison */}
              {resumes.length >= 2 && (
                <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                    <GitCompare className="h-4 w-4 text-violet-700 dark:text-violet-400" />
                    <span>Resume Version Comparison</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select
                      value={compareA}
                      onChange={(e) => setCompareA(Number(e.target.value))}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    >
                      {resumes.map((r) => (
                        <option key={r.id} value={r.id}>
                          v{r.version_number} ({r.overall_score}/100)
                        </option>
                      ))}
                    </select>
                    <span className="text-xs text-slate-500">vs.</span>
                    <select
                      value={compareB}
                      onChange={(e) => setCompareB(Number(e.target.value))}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    >
                      {resumes.map((r) => (
                        <option key={r.id} value={r.id}>
                          v{r.version_number} ({r.overall_score}/100)
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleCompareVersions}
                      className="btn-glossy-teal rounded-full px-4 py-1.5 text-xs font-bold"
                    >
                      Compare Versions
                    </button>
                  </div>

                  {compareResult && (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-950">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        Score Delta:{' '}
                        <span className={compareResult.scoreDelta >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600'}>
                          {compareResult.scoreDelta >= 0 ? `+${compareResult.scoreDelta}` : compareResult.scoreDelta} points
                        </span>
                      </p>
                      <p className="mt-1.5 text-slate-600 dark:text-slate-300">
                        <span className="font-medium text-emerald-700 dark:text-emerald-400">Added Skills:</span>{' '}
                        {compareResult.addedSkills.join(', ') || 'None'}
                      </p>
                      <p className="mt-1 text-slate-600 dark:text-slate-300">
                        <span className="font-medium text-slate-800 dark:text-slate-200">Removed Skills:</span>{' '}
                        {compareResult.removedSkills.join(', ') || 'None'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Active Resume Detailed Scoring, Extraction & Improvements */}
          {activeResume && (
            <div className="space-y-6">
              {/* Transparent Rubric Breakdown */}
              <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950 dark:text-white">
                      Score Breakdown · v{activeResume.version_number} ({activeResume.original_filename})
                    </h2>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {activeResume.scoreExplanations?.overall}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-extrabold tabular-nums text-[#198F90] dark:text-[#20B4B6]">
                      {activeResume.overall_score} / 100
                    </p>
                    <p className="text-xs text-slate-500">
                      Engine: {activeResume.ai_provider === 'gemini' ? 'Gemini 4 Hydrogen' : 'Local NLP Heuristic'}
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    { key: 'technical', label: 'Technical Skills Score', score: activeResume.technical_score },
                    { key: 'experience', label: 'Experience Score', score: activeResume.experience_score },
                    { key: 'education', label: 'Education Score', score: activeResume.education_score },
                    { key: 'project', label: 'Project Relevance Score', score: activeResume.project_score },
                    { key: 'formatting', label: 'Formatting Score', score: activeResume.formatting_score },
                    { key: 'readability', label: 'Readability Score', score: activeResume.readability_score },
                  ].map((dim, idx) => (
                    <motion.div
                      key={dim.key}
                      initial={{ opacity: 0, y: 10, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      whileHover={{ y: -2 }}
                      transition={{ type: 'spring', stiffness: 360, damping: 24, delay: idx * 0.04 }}
                      className="surface-specular-card rounded-xl border border-slate-200 p-4 dark:border-slate-800"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{dim.label}</span>
                        <span className="font-mono text-sm font-bold tabular-nums text-[#198F90] dark:text-[#20B4B6]">{dim.score}%</span>
                      </div>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${dim.score}%` }}
                          transition={{ duration: 0.6, ease: 'easeOut', delay: idx * 0.05 }}
                          className="bar-glossy-teal h-2 rounded-full"
                        />
                      </div>
                      <p className="mt-2.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                        {activeResume.scoreExplanations?.[dim.key]}
                      </p>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Extracted Information */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 space-y-4">
                  <h3 className="text-base font-bold text-slate-950 dark:text-white">Extracted Resume Profile</h3>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Generated Professional Summary</p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                      {activeResume.extractedData?.summary}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Technical Skills</p>
                    <p className="mt-1 text-sm text-slate-900 dark:text-white">
                      {(activeResume.extractedData?.technicalSkills || []).join(' · ') || 'None detected'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Soft Skills</p>
                    <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                      {(activeResume.extractedData?.softSkills || []).join(' · ') || 'None detected'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Education &amp; Certifications</p>
                    <ul className="mt-1 space-y-1 text-xs text-slate-700 dark:text-slate-300">
                      {(activeResume.extractedData?.education || []).map((ed, i) => (
                        <li key={i}>{ed.degree} — {ed.institution} {ed.year ? `(${ed.year})` : ''}</li>
                      ))}
                      {(activeResume.extractedData?.certifications || []).map((cert, i) => (
                        <li key={`c-${i}`} className="text-blue-700 dark:text-blue-400">Certification: {cert}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* AI Improvement & Original vs Improved Comparison */}
                <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 space-y-4">
                  <h3 className="text-base font-bold text-slate-950 dark:text-white">AI Improvement &amp; Rewrite Comparison</h3>

                  <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3.5 text-xs dark:border-blue-900/50 dark:bg-blue-950/30">
                    <p className="font-semibold text-blue-900 dark:text-blue-200">Suggested Improved Summary</p>
                    <p className="mt-1 leading-relaxed text-slate-700 dark:text-slate-300">
                      {activeResume.improvements?.improvedSummary}
                    </p>
                  </div>

                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Original vs. Improved Bullet Comparison</p>
                    {(activeResume.improvements?.bulletComparisons || []).map((bc, idx) => (
                      <div key={idx} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 p-3 text-xs sm:grid-cols-2 dark:border-slate-800">
                        <div>
                          <p className="font-semibold text-slate-500">Original ({bc.section})</p>
                          <p className="mt-1 text-slate-700 dark:text-slate-300">{bc.original}</p>
                        </div>
                        <div>
                          <p className="font-semibold text-emerald-700 dark:text-emerald-400">Improved</p>
                          <p className="mt-1 text-slate-900 dark:text-white">{bc.improved}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
                    <div>
                      <p className="font-semibold text-slate-700 dark:text-slate-300">Missing Info &amp; Grammar Tips</p>
                      <ul className="mt-1.5 space-y-1 list-disc pl-4 text-slate-600 dark:text-slate-400">
                        {(activeResume.improvements?.missingInformation || []).map((m, i) => <li key={i}>{m}</li>)}
                        {(activeResume.improvements?.grammarSuggestions || []).map((g, i) => <li key={`g-${i}`}>{g}</li>)}
                      </ul>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-700 dark:text-slate-300">Resume Checklist &amp; Recommended Skills</p>
                      <ul className="mt-1.5 space-y-1.5 text-slate-600 dark:text-slate-400">
                        {(activeResume.improvements?.checklist || []).map((c, i) => (
                          <li key={i} className="flex items-center gap-1.5">
                            <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 ${c.done ? 'text-emerald-600' : 'text-slate-300 dark:text-slate-600'}`} />
                            <span>{c.item}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 font-medium text-violet-700 dark:text-violet-400">
                        Add skills: {(activeResume.improvements?.skillRecommendations || []).join(', ')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* JOB PORTAL TAB */}
      {activeTab === 'jobs' && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-950 dark:text-white">Job Portal</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Explore open positions with real-time AI compatibility scores based on your skills and resume.
            </p>
          </div>

          {/* Search & Filters */}
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={jobQuery}
                onChange={(e) => setJobQuery(e.target.value)}
                placeholder="Search by job title or company..."
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>
            <input
              type="text"
              value={jobSkill}
              onChange={(e) => setJobSkill(e.target.value)}
              placeholder="Filter by skill (e.g. Python, ML)"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
            <select
              value={jobLocation}
              onChange={(e) => setJobLocation(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="all">All Locations</option>
              <option value="San Francisco">San Francisco</option>
              <option value="Remote">Remote</option>
              <option value="Seattle">Seattle</option>
              <option value="New York">New York</option>
            </select>
            <div className="flex gap-2">
              <select
                value={jobType}
                onChange={(e) => setJobType(e.target.value)}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                <option value="all">All Types</option>
                <option value="Full-time">Full-time</option>
                <option value="Internship">Internship</option>
              </select>
              <select
                value={jobExp}
                onChange={(e) => setJobExp(e.target.value)}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                <option value="all">All Levels</option>
                <option value="Internship">Internship</option>
                <option value="Entry Level">Entry Level</option>
                <option value="Associate">Associate</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Listings */}
            <div className="lg:col-span-5 space-y-3">
              {jobs.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                  No jobs match your filters. Try clearing location or skill filters.
                </div>
              ) : (
                jobs.map((job) => (
                  <motion.div
                    key={job.id}
                    whileHover={{ y: -2, scale: 1.005 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 24 }}
                    onClick={() => {
                      setSelectedJob(job);
                      setJobActionMsg('');
                    }}
                    className={`surface-specular-card cursor-pointer rounded-2xl border p-4 transition-colors ${
                      selectedJob?.id === job.id
                        ? 'border-[#1EA8A9] bg-teal-50/40 dark:border-[#20B4B6] dark:bg-teal-950/20'
                        : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-slate-950 dark:text-white">{job.title}</h3>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {job.company} · {job.location} · {job.job_type}
                        </p>
                      </div>
                      {job.compatibility && (
                        <span className="font-mono text-xs font-bold tabular-nums text-[#198F90] dark:text-[#20B4B6] shrink-0">
                          {job.compatibility.overallMatch}% match
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                      Skills: {job.requiredSkills.join(' · ')}
                    </p>
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                      <span className="font-mono">{job.salary_range}</span>
                      {job.applicationStatus && (
                        <span className="font-semibold capitalize text-emerald-700 dark:text-emerald-400">
                          Applied ({job.applicationStatus})
                        </span>
                      )}
                    </div>
                  </motion.div>
                ))
              )}
            </div>

            {/* Job Details */}
            <div className="lg:col-span-7">
              {selectedJob ? (
                <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
                    <div>
                      <h2 className="text-xl font-bold text-slate-950 dark:text-white">{selectedJob.title}</h2>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                        {selectedJob.company} · {selectedJob.location} · {selectedJob.experience_level}
                      </p>
                      <p className="mt-1 font-mono text-xs text-slate-500">{selectedJob.salary_range}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSaveJob(selectedJob.id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${
                        selectedJob.isSaved
                          ? 'border-blue-600 bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200'
                          : 'border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <Bookmark className="h-3.5 w-3.5" />
                      {selectedJob.isSaved ? 'Saved' : 'Save Job'}
                    </button>
                  </div>

                  {selectedJob.compatibility && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/50 dark:bg-blue-950/30">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-blue-950 dark:text-blue-200">AI Compatibility Analysis</span>
                        <span className="font-mono text-sm font-bold tabular-nums text-blue-700 dark:text-blue-400">
                          {selectedJob.compatibility.overallMatch}% Compatible
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-slate-700 dark:text-slate-300">{selectedJob.compatibility.explanation}</p>
                      <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                        Matched: {selectedJob.compatibility.matchedSkills.join(', ') || 'None'} · Missing:{' '}
                        {selectedJob.compatibility.missingSkills.join(', ') || 'None'}
                      </p>
                    </div>
                  )}

                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Role Description</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{selectedJob.description}</p>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Responsibilities</h3>
                    <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
                      {selectedJob.responsibilities.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs border-t border-slate-200 pt-4 dark:border-slate-800">
                    <div>
                      <p className="font-semibold text-slate-700 dark:text-slate-300">Required Skills</p>
                      <p className="mt-1 text-slate-600 dark:text-slate-400">{selectedJob.requiredSkills.join(' · ')}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-700 dark:text-slate-300">Qualification Requirements</p>
                      <p className="mt-1 text-slate-600 dark:text-slate-400">
                        {selectedJob.education_requirement} · Min {selectedJob.min_years_experience} yr(s) experience
                      </p>
                    </div>
                  </div>

                  {/* Apply Controls */}
                  <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
                    {selectedJob.applicationStatus ? (
                      <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                        You have already applied to this job (Status: {selectedJob.applicationStatus}).
                      </p>
                    ) : (
                      <div className="flex flex-wrap items-center gap-3">
                        <select
                          value={applyResumeId || resumes[0]?.id || ''}
                          onChange={(e) => setApplyResumeId(Number(e.target.value))}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                        >
                          {resumes.map((r) => (
                            <option key={r.id} value={r.id}>
                              Apply with v{r.version_number} ({r.original_filename})
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleApplyJob(selectedJob.id)}
                          className="btn-glossy-teal inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold"
                        >
                          Submit Application
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    {jobActionMsg && <p className="mt-2 text-xs font-medium text-[#198F90] dark:text-[#20B4B6]">{jobActionMsg}</p>}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* SKILL GAP ANALYZER TAB */}
      {activeTab === 'skill-gap' && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-950 dark:text-white">Skill Gap Analyzer</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Compare your verified skills against any open job or custom target requirements using semantic synonym matching.
            </p>
          </div>

          <form onSubmit={handleRunSkillGap} className="surface-specular-card rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Compare Against Open Job</label>
                <select
                  value={gapJobId}
                  onChange={(e) => setGapJobId(e.target.value ? Number(e.target.value) : '')}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  <option value="">-- Use Custom Skill List Below --</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title} — {j.company}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Or Custom Target Skills (comma separated)</label>
                <input
                  type="text"
                  disabled={Boolean(gapJobId)}
                  value={customGapSkills}
                  onChange={(e) => setCustomGapSkills(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={gapLoading}
              className="btn-glossy-teal rounded-full px-5 py-2 text-xs font-bold"
            >
              {gapLoading ? 'Comparing...' : 'Analyze Skill Gaps'}
            </button>
          </form>

          {gapResult && (
            <div className="space-y-5">
              <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950 dark:text-white">{gapResult.roleTitle}</h2>
                    <p className="mt-1 text-xs text-slate-500">{gapResult.explanation}</p>
                  </div>
                  <span className="font-mono text-2xl font-extrabold tabular-nums text-blue-700 dark:text-blue-400">
                    {gapResult.skillsMatch}% Skills Match
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3 text-xs">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                    <p className="font-semibold text-emerald-800 dark:text-emerald-300">Matched Skills ({gapResult.matchedSkills.length})</p>
                    <ul className="mt-2 space-y-1 text-slate-700 dark:text-slate-300">
                      {gapResult.matchedSkills.map((s) => (
                        <li key={s} className="flex items-center gap-1.5">
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
                    <p className="font-semibold text-amber-800 dark:text-amber-300">
                      Partially Matched ({gapResult.partiallyMatchedSkills.length})
                    </p>
                    <ul className="mt-2 space-y-1 text-slate-700 dark:text-slate-300">
                      {gapResult.partiallyMatchedSkills.length === 0 ? (
                        <li>None</li>
                      ) : (
                        gapResult.partiallyMatchedSkills.map((s) => <li key={s}>{s}</li>)
                      )}
                    </ul>
                  </div>

                  <div className="rounded-lg border border-red-200 bg-red-50/50 p-4 dark:border-red-900/50 dark:bg-red-950/20">
                    <p className="font-semibold text-red-800 dark:text-red-300">Missing Skills ({gapResult.missingSkills.length})</p>
                    <ul className="mt-2 space-y-1 text-slate-700 dark:text-slate-300">
                      {gapResult.missingSkills.length === 0 ? (
                        <li>No missing core skills.</li>
                      ) : (
                        gapResult.missingSkills.map((s) => <li key={s}>{s}</li>)
                      )}
                    </ul>
                  </div>
                </div>
              </div>

              {gapResult.learningPriorities.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="text-base font-bold text-slate-950 dark:text-white">Recommended Learning Priorities</h3>
                  <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                    {gapResult.learningPriorities.map((lp) => (
                      <div key={lp.skill} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white">{lp.skill}</p>
                          <p className="text-slate-500">{lp.rationale}</p>
                        </div>
                        <div className="text-right font-mono">
                          <span className="font-semibold text-violet-700 dark:text-violet-400">{lp.priority} Priority</span>
                          <span className="mx-2 text-slate-300">·</span>
                          <span className="text-slate-600 dark:text-slate-300">~{lp.estimatedStudyHours} hrs</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* AI CAREER ROADMAP TAB */}
      {activeTab === 'roadmap' && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-950 dark:text-white">AI Career Roadmap</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Select a target career to generate sequenced learning milestones, portfolio projects, and progress tracking.
            </p>
          </div>

          <form onSubmit={handleGenerateRoadmap} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex-1 min-w-[240px]">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Target Career Role</label>
              <input
                type="text"
                required
                value={roadmapRole}
                onChange={(e) => setRoadmapRole(e.target.value)}
                placeholder="e.g., Machine Learning Engineer, Full-Stack Developer, Data Engineer"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>
            <button
              type="submit"
              disabled={roadmapLoading}
              className="btn-glossy-teal inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {roadmapLoading ? 'Generating Roadmap...' : 'Generate Roadmap'}
            </button>
          </form>

          {roadmaps.map((rm) => {
            const milestones = (rm.milestones as Array<{ id: string; order: number; title: string; duration: string; skills: string[]; description: string; completed?: boolean }>) || [];
            const projects = (rm.projects as Array<{ title: string; outcome: string }>) || [];
            return (
              <motion.div
                key={String(rm.id)}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 26 }}
                className="surface-specular-card rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 space-y-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950 dark:text-white">{String(rm.target_role)}</h2>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Current Skills: {(rm.currentSkills as string[])?.join(' · ')}
                    </p>
                    <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                      Missing Skills to Acquire: {(rm.missingSkills as string[])?.join(' · ') || 'None'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-xl font-bold tabular-nums text-[#198F90] dark:text-[#20B4B6]">
                      {Number(rm.progress_percent)}% Complete
                    </p>
                    <div className="mt-1.5 h-2 w-36 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Number(rm.progress_percent)}%` }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                        className="bar-glossy-teal h-2 rounded-full"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {milestones.map((m) => (
                    <label
                      key={m.id}
                      className="flex items-start gap-3 rounded-lg border border-slate-200 p-4 cursor-pointer hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(m.completed)}
                        onChange={(e) => handleToggleMilestone(Number(rm.id), m.id, e.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-700"
                      />
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className={`text-sm font-semibold ${m.completed ? 'line-through text-slate-400' : 'text-slate-900 dark:text-white'}`}>
                            {m.order}. {m.title}
                          </span>
                          <span className="font-mono text-xs text-slate-500">{m.duration}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{m.description}</p>
                        <p className="mt-1.5 text-[11px] text-blue-700 dark:text-blue-400">Skills: {(m.skills || []).join(' · ')}</p>
                      </div>
                    </label>
                  ))}
                </div>

                {projects.length > 0 && (
                  <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Recommended Portfolio Projects</p>
                    <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {projects.map((p, i) => (
                        <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-950">
                          <p className="font-semibold text-slate-900 dark:text-white">{p.title}</p>
                          <p className="mt-1 text-slate-600 dark:text-slate-400">{p.outcome}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* AI INTERVIEW PREPARATION TAB */}
      {activeTab === 'interview' && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-950 dark:text-white">AI Interview Simulator</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Practice Technical, HR, Resume-based, and Job-Description-based interview questions with immediate AI scoring and improvement tips.
            </p>
          </div>

          <form onSubmit={handleGenerateInterview} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-4 dark:border-slate-800 dark:bg-slate-900">
            <input
              type="text"
              value={intRole}
              onChange={(e) => setIntRole(e.target.value)}
              placeholder="Target Role Title"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
            <select
              value={intMode}
              onChange={(e) => setIntMode(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="technical">Technical Interview</option>
              <option value="hr">HR / Behavioral Interview</option>
              <option value="resume">Resume-Based Deep Dive</option>
              <option value="job_desc">Job-Description Alignment</option>
            </select>
            <select
              value={intJobId}
              onChange={(e) => setIntJobId(e.target.value ? Number(e.target.value) : '')}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="">Optional: Link Open Job</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>{j.title}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={intLoading}
              className="btn-glossy-teal rounded-full px-5 py-2 text-xs font-bold"
            >
              {intLoading ? 'Generating...' : 'Start New Practice Session'}
            </button>
          </form>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-sm font-bold text-slate-950 dark:text-white">Interview History</h2>
              <div className="mt-3 space-y-2">
                {interviews.map((s) => (
                  <button
                    key={String(s.id)}
                    type="button"
                    onClick={() => setActiveSessionId(Number(s.id))}
                    className={`w-full rounded-lg border p-3 text-left text-xs ${
                      Number(activeSession?.id) === Number(s.id)
                        ? 'border-blue-600 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-950/30'
                        : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <p className="font-semibold text-slate-900 dark:text-white">{String(s.role_title)}</p>
                    <p className="mt-0.5 capitalize text-slate-500">{String(s.mode)} · {String(s.created_at).slice(0, 10)}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="lg:col-span-8 space-y-4">
              {activeSession ? (
                ((activeSession.questions as Array<{ index: number; type: string; question: string }>) || []).map((q) => {
                  const responses = (activeSession.responses as Array<{ question_index: number; user_answer: string; ai_score: number; ai_feedback: string; improvementTips: string[] }>) || [];
                  const existing = responses.find((r) => r.question_index === q.index);
                  const draftKey = `${activeSession.id}-${q.index}`;
                  return (
                    <div key={q.index} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-3">
                      <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">Question {q.index + 1} · {q.type}</p>
                      <p className="text-sm font-semibold text-slate-950 dark:text-white">{q.question}</p>

                      {existing ? (
                        <div className="space-y-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700 dark:bg-slate-950 dark:text-slate-300">
                            <span className="font-semibold">Your Answer: </span>{existing.user_answer}
                          </div>
                          <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3.5 text-xs dark:border-blue-900/50 dark:bg-blue-950/30">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-blue-900 dark:text-blue-200">AI Evaluation Feedback</span>
                              <span className="font-mono font-bold tabular-nums text-blue-700 dark:text-blue-400">{existing.ai_score}/100</span>
                            </div>
                            <p className="mt-1.5 text-slate-700 dark:text-slate-300">{existing.ai_feedback}</p>
                            <ul className="mt-2 list-disc pl-4 text-slate-600 dark:text-slate-400">
                              {existing.improvementTips.map((t, i) => <li key={i}>{t}</li>)}
                            </ul>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <textarea
                            rows={3}
                            value={answerDrafts[draftKey] || ''}
                            onChange={(e) => setAnswerDrafts((d) => ({ ...d, [draftKey]: e.target.value }))}
                            placeholder="Write a structured response (STAR method or architectural trade-offs)..."
                            className="w-full rounded-lg border border-slate-300 bg-white p-3 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                          <button
                            type="button"
                            disabled={submittingAnswerKey === draftKey || (answerDrafts[draftKey] || '').trim().length < 10}
                            onClick={() => handleSubmitAnswer(Number(activeSession.id), q.index, q.question)}
                            className="btn-glossy-teal rounded-full px-5 py-2 text-xs font-bold disabled:opacity-50"
                          >
                            {submittingAnswerKey === draftKey ? 'Evaluating...' : 'Submit Answer for AI Feedback'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                  Start a practice session above to generate tailored interview questions.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* APPLICATION TRACKING TAB */}
      {activeTab === 'applications' && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-950 dark:text-white">Application Tracking</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Monitor application stages, shortlisted invitations, recruiter feedback, and withdraw active applications when needed.
            </p>
          </div>

          <div className="space-y-4">
            {applications.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                You haven&apos;t submitted any applications yet. Visit the Job Portal to apply.
              </div>
            ) : (
              applications.map((app) => (
                <div key={String(app.id)} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base font-bold text-slate-950 dark:text-white">{String(app.job_title)}</h3>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {String(app.company)} · {String(app.location)} · Resume: {String(app.original_filename)}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-sm font-bold tabular-nums text-blue-700 dark:text-blue-400">
                        {Number(app.match_score)}% Match
                      </span>
                      <span className="text-xs font-semibold capitalize text-slate-800 dark:text-slate-200">
                        Status: {String(app.status)}
                      </span>
                    </div>
                  </div>

                  {Boolean(app.interview_date) && (
                    <p className="mt-3 text-xs font-medium text-violet-700 dark:text-violet-400">
                      Interview Scheduled: {String(app.interview_date)}
                    </p>
                  )}

                  {Boolean(app.recruiter_feedback) && (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                      <span className="font-semibold text-slate-900 dark:text-white">Recruiter Feedback: </span>
                      {String(app.recruiter_feedback)}
                    </div>
                  )}

                  {!['offered', 'rejected', 'withdrawn'].includes(String(app.status)) && (
                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleWithdrawApp(Number(app.id))}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400"
                      >
                        Withdraw Application
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </PortalLayout>
  );
}
