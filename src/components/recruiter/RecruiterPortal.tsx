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
  Briefcase,
  Check,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileSpreadsheet,
  LayoutDashboard,
  MessageSquarePlus,
  Plus,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { PortalLayout, NavItem } from '../PortalLayout';
import { useAuth } from '../../context/AuthContext';
import { apiRequest, getAuthToken } from '../../lib/api';
import { ExplainableMatch, JobListing } from '../../types';

interface RecruiterPortalProps {
  onGoHome: () => void;
}

interface CandidateRow {
  id: number;
  job_id: number;
  job_title: string;
  company: string;
  resume_id: number;
  original_filename: string;
  anonymized_code: string;
  isBlind: boolean;
  identity_revealed: boolean;
  displayName: string;
  contactEmail: string;
  contactPhone: string;
  status: string;
  match_score: number;
  skills_match: number;
  experience_match: number;
  education_match: number;
  resume_quality_score: number;
  is_favorite: boolean;
  recruiter_notes: string;
  recruiter_feedback: string;
  interview_date: string;
  interview_outcome: string;
  ai_provider: string;
  explainable: ExplainableMatch;
  extractedData: {
    summary?: string;
    technicalSkills?: string[];
    softSkills?: string[];
    education?: Array<{ institution: string; degree: string; year: string }>;
    experience?: Array<{ role: string; company: string; duration: string; highlights: string[] }>;
    projects?: Array<{ name: string; description: string }>;
    certifications?: string[];
  };
  resumePreviewText: string;
  created_at: string;
}

export function RecruiterPortal({ onGoHome }: RecruiterPortalProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [dashboard, setDashboard] = useState<{
    totalJobsPosted: number;
    activeJobsCount: number;
    totalResumesReceived: number;
    candidatesAnalyzed: number;
    shortlistedCandidates: number;
    avgMatchScore: number;
    statusCounts: Array<{ stage: string; count: number }>;
    scoreBuckets: Array<{ range: string; count: number }>;
    activities: Array<{ id: number; details: string; created_at: string }>;
  } | null>(null);

  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);

  // Job form state
  const [editingJobId, setEditingJobId] = useState<number | null>(null);
  const [jobForm, setJobForm] = useState({
    title: '',
    company: user?.company_name || 'Northstar Systems',
    location: 'San Francisco, CA (Hybrid)',
    jobType: 'Full-time',
    experienceLevel: 'Entry Level',
    minYearsExperience: '1',
    educationRequirement: "Bachelor's Degree in Computer Science or related field",
    salaryRange: '$110,000 - $135,000',
    description: '',
    responsibilitiesText: '',
    requiredSkillsText: 'Python, Machine Learning, SQL',
    preferredSkillsText: 'Docker, FastAPI',
    softSkillsText: 'Communication, Collaboration',
    blindMode: true,
  });
  const [jdLoading, setJdLoading] = useState(false);
  const [jobMsg, setJobMsg] = useState('');

  // Bulk Upload state
  const [bulkJobId, setBulkJobId] = useState<number | ''>('');
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResults, setBulkResults] = useState<Array<Record<string, unknown>>>([]);
  const [bulkError, setBulkError] = useState('');

  // Candidate Ranking & Profile state
  const [filterJobId, setFilterJobId] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterMinScore, setFilterMinScore] = useState('0');
  const [sortBy, setSortBy] = useState('match');
  const [blindModeView, setBlindModeView] = useState(true);
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(null);
  const [compareIds, setCompareIds] = useState<number[]>([]);

  // Candidate edit / feedback / questions
  const [skillEditText, setSkillEditText] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [feedbackDraft, setFeedbackDraft] = useState('');
  const [interviewDateDraft, setInterviewDateDraft] = useState('');
  const [outcomeDraft, setOutcomeDraft] = useState('');
  const [candActionMsg, setCandActionMsg] = useState('');
  const [generatedQuestions, setGeneratedQuestions] = useState<Array<{ index: number; type: string; question: string }>>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);

  const loadData = useCallback(async () => {
    const [dash, jobList] = await Promise.all([
      apiRequest<typeof dashboard>('/api/recruiter/dashboard'),
      apiRequest<JobListing[]>('/api/recruiter/jobs'),
    ]);
    setDashboard(dash);
    setJobs(jobList);
    if (jobList.length > 0 && !bulkJobId) {
      setBulkJobId(jobList[0].id);
    }
  }, [bulkJobId]);

  const loadCandidates = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterJobId !== 'all') params.set('jobId', filterJobId);
    if (filterStatus !== 'all') params.set('status', filterStatus);
    if (Number(filterMinScore) > 0) params.set('minScore', filterMinScore);
    params.set('sortBy', sortBy);
    params.set('blindMode', blindModeView ? 'true' : 'false');

    const list = await apiRequest<CandidateRow[]>(`/api/recruiter/candidates?${params.toString()}`);
    setCandidates(list);
    if (list.length > 0 && !selectedCandidateId) {
      setSelectedCandidateId(list[0].id);
    }
  }, [filterJobId, filterStatus, filterMinScore, sortBy, blindModeView, selectedCandidateId]);

  useEffect(() => {
    loadData().catch(() => {});
  }, [loadData]);

  useEffect(() => {
    loadCandidates().catch(() => {});
  }, [loadCandidates]);

  const activeCandidate = candidates.find((c) => c.id === selectedCandidateId) || candidates[0] || null;

  useEffect(() => {
    if (activeCandidate) {
      setSkillEditText((activeCandidate.extractedData?.technicalSkills || []).join(', '));
      setNotesDraft(activeCandidate.recruiter_notes || '');
      setFeedbackDraft(activeCandidate.recruiter_feedback || '');
      setInterviewDateDraft(activeCandidate.interview_date || '');
      setOutcomeDraft(activeCandidate.interview_outcome || '');
      setGeneratedQuestions([]);
      setCandActionMsg('');
    }
  }, [activeCandidate?.id]);

  const navItems: NavItem[] = [
    { id: 'overview', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
    { id: 'jobs', label: 'Job Management', icon: <Briefcase className="h-4 w-4" /> },
    { id: 'bulk-upload', label: 'Bulk Resume Screening', icon: <Upload className="h-4 w-4" /> },
    { id: 'candidates', label: 'Candidate Ranking', icon: <Users className="h-4 w-4" /> },
  ];

  const handleGenerateJD = async () => {
    if (!jobForm.title.trim()) {
      setJobMsg('Enter a Job Title first to generate a job description.');
      return;
    }
    setJdLoading(true);
    setJobMsg('');
    try {
      const jd = await apiRequest<{
        description: string;
        responsibilities: string[];
        requiredSkills: string[];
        preferredSkills: string[];
        softSkills: string[];
        educationRequirement: string;
        minYearsExperience: number;
      }>('/api/recruiter/jobs/generate-jd', {
        method: 'POST',
        body: JSON.stringify({
          title: jobForm.title,
          company: jobForm.company,
          experienceLevel: jobForm.experienceLevel,
          location: jobForm.location,
        }),
      });
      setJobForm((f) => ({
        ...f,
        description: jd.description,
        responsibilitiesText: jd.responsibilities.join('\n'),
        requiredSkillsText: jd.requiredSkills.join(', '),
        preferredSkillsText: jd.preferredSkills.join(', '),
        softSkillsText: jd.softSkills.join(', '),
        educationRequirement: jd.educationRequirement,
        minYearsExperience: String(jd.minYearsExperience),
      }));
      setJobMsg('AI draft populated. Review and edit before publishing.');
    } catch (err) {
      setJobMsg(err instanceof Error ? err.message : 'Generation failed.');
    } finally {
      setJdLoading(false);
    }
  };

  const handleSaveJob = async (e: React.FormEvent) => {
    e.preventDefault();
    setJobMsg('');
    const payload = {
      title: jobForm.title,
      company: jobForm.company,
      location: jobForm.location,
      jobType: jobForm.jobType,
      experienceLevel: jobForm.experienceLevel,
      minYearsExperience: Number(jobForm.minYearsExperience) || 0,
      educationRequirement: jobForm.educationRequirement,
      salaryRange: jobForm.salaryRange,
      description: jobForm.description,
      responsibilities: jobForm.responsibilitiesText.split('\n').map((s) => s.trim()).filter(Boolean),
      requiredSkills: jobForm.requiredSkillsText.split(',').map((s) => s.trim()).filter(Boolean),
      preferredSkills: jobForm.preferredSkillsText.split(',').map((s) => s.trim()).filter(Boolean),
      softSkills: jobForm.softSkillsText.split(',').map((s) => s.trim()).filter(Boolean),
      blindMode: jobForm.blindMode,
    };

    if (editingJobId) {
      await apiRequest(`/api/recruiter/jobs/${editingJobId}`, { method: 'PUT', body: JSON.stringify(payload) });
      setJobMsg('Job updated.');
      setEditingJobId(null);
    } else {
      await apiRequest('/api/recruiter/jobs', { method: 'POST', body: JSON.stringify(payload) });
      setJobMsg('Job opening published.');
    }
    setJobForm((f) => ({ ...f, title: '', description: '', responsibilitiesText: '' }));
    await loadData();
  };

  const handleEditJob = (job: JobListing) => {
    setEditingJobId(job.id);
    setJobForm({
      title: job.title,
      company: job.company,
      location: job.location,
      jobType: job.job_type,
      experienceLevel: job.experience_level,
      minYearsExperience: String(job.min_years_experience),
      educationRequirement: job.education_requirement,
      salaryRange: job.salary_range,
      description: job.description,
      responsibilitiesText: job.responsibilities.join('\n'),
      requiredSkillsText: job.requiredSkills.join(', '),
      preferredSkillsText: job.preferredSkills.join(', '),
      softSkillsText: job.softSkills.join(', '),
      blindMode: job.blind_mode,
    });
  };

  const handleToggleJob = async (id: number) => {
    await apiRequest(`/api/recruiter/jobs/${id}/toggle`, { method: 'PATCH' });
    await loadData();
  };

  const handleDeleteJob = async (id: number) => {
    await apiRequest(`/api/recruiter/jobs/${id}`, { method: 'DELETE' });
    await loadData();
  };

  const handleBulkUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkJobId || bulkFiles.length === 0) {
      setBulkError('Select a target job and at least one PDF/DOCX/TXT resume.');
      return;
    }
    setBulkUploading(true);
    setBulkError('');
    setBulkResults([]);
    try {
      const form = new FormData();
      form.append('jobId', String(bulkJobId));
      bulkFiles.forEach((f) => form.append('files', f));
      const res = await apiRequest<{ results: Array<Record<string, unknown>> }>('/api/recruiter/resumes/bulk-upload', {
        method: 'POST',
        body: form,
      });
      setBulkResults(res.results);
      setBulkFiles([]);
      await loadData();
      await loadCandidates();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : 'Bulk screening failed.');
    } finally {
      setBulkUploading(false);
    }
  };

  const handleRecalculateSkills = async () => {
    if (!activeCandidate) return;
    const skills = skillEditText.split(',').map((s) => s.trim()).filter(Boolean);
    await apiRequest(`/api/recruiter/candidates/${activeCandidate.id}/skills`, {
      method: 'PATCH',
      body: JSON.stringify({ skills }),
    });
    setCandActionMsg('Skills updated and match score recalculated.');
    await loadCandidates();
  };

  const handleUpdateCandidateStatus = async (payload: Record<string, unknown>, msg: string) => {
    if (!activeCandidate) return;
    await apiRequest(`/api/recruiter/candidates/${activeCandidate.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    setCandActionMsg(msg);
    await loadCandidates();
    await loadData();
  };

  const handleGenerateQuestions = async () => {
    if (!activeCandidate) return;
    setQuestionsLoading(true);
    try {
      const res = await apiRequest<{ questions: Array<{ index: number; type: string; question: string }> }>(
        `/api/recruiter/candidates/${activeCandidate.id}/questions`,
        { method: 'POST' }
      );
      setGeneratedQuestions(res.questions || []);
    } finally {
      setQuestionsLoading(false);
    }
  };

  const handleAuthenticatedDownload = async (url: string, filename: string) => {
    const token = getAuthToken();
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(objUrl);
  };

  const toggleCompareCandidate = (id: number) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 2 ? [...prev, id] : [prev[1], id]
    );
  };

  const comparedPair = candidates.filter((c) => compareIds.includes(c.id));

  return (
    <PortalLayout
      portalTitle="Recruiter Portal"
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
              <h1 className="text-2xl font-bold text-slate-950 dark:text-white">Recruiter Overview</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Fair, explainable AI resume screening and candidate pipeline metrics.
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setActiveTab('bulk-upload')}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                <Upload className="h-3.5 w-3.5" />
                Bulk Screen Resumes
              </button>
              <button
                onClick={() => setActiveTab('jobs')}
                className="btn-glossy-teal inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold"
              >
                <Plus className="h-3.5 w-3.5" />
                New Job Opening
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { label: 'Total Jobs Posted', val: dashboard?.totalJobsPosted ?? 0 },
              { label: 'Resumes Received', val: dashboard?.totalResumesReceived ?? 0 },
              { label: 'Candidates Analyzed', val: dashboard?.candidatesAnalyzed ?? 0 },
              { label: 'Shortlisted', val: dashboard?.shortlistedCandidates ?? 0 },
              { label: 'Avg Match Score', val: `${dashboard?.avgMatchScore ?? 0}%` },
            ].map((stat, idx) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 14, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                whileHover={{ y: -3 }}
                transition={{ type: 'spring', stiffness: 360, damping: 24, delay: idx * 0.04 }}
                className="surface-specular-card rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
              >
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{stat.label}</p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-[#198F90] dark:text-[#20B4B6]">{stat.val}</p>
              </motion.div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26, delay: 0.12 }}
              className="surface-specular-card rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
            >
              <h2 className="text-base font-semibold text-slate-950 dark:text-white">Pipeline Stage Distribution</h2>
              <div className="mt-4 h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dashboard?.statusCounts || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="stage" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#198F90" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26, delay: 0.18 }}
              className="surface-specular-card rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
            >
              <h2 className="text-base font-semibold text-slate-950 dark:text-white">Match Score Distribution</h2>
              <div className="mt-4 h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dashboard?.scoreBuckets || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="range" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#20B4B6" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">Recent Recruitment Activity</h2>
            <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
              {(dashboard?.activities || []).map((a) => (
                <div key={a.id} className="flex items-center justify-between py-2.5 text-xs">
                  <span className="text-slate-700 dark:text-slate-300">{a.details}</span>
                  <span className="font-mono text-slate-400">{a.created_at.slice(0, 10)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* JOB MANAGEMENT & AI JD GENERATOR TAB */}
      {activeTab === 'jobs' && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-950 dark:text-white">Job Management &amp; AI Description Generator</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Create, edit, pause, or generate structured job postings with configurable required skills and blind screening defaults.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Create / Edit Job Form */}
            <form onSubmit={handleSaveJob} className="lg:col-span-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                <h2 className="text-base font-bold text-slate-950 dark:text-white">
                  {editingJobId ? 'Edit Job Posting' : 'Create Job Opening'}
                </h2>
                <button
                  type="button"
                  onClick={handleGenerateJD}
                  disabled={jdLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-200"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {jdLoading ? 'Generating...' : 'AI Generate JD'}
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Job Title</label>
                  <input
                    type="text"
                    required
                    value={jobForm.title}
                    onChange={(e) => setJobForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="e.g., Backend Python Engineer"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Company</label>
                  <input
                    type="text"
                    required
                    value={jobForm.company}
                    onChange={(e) => setJobForm((f) => ({ ...f, company: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Location</label>
                  <input
                    type="text"
                    required
                    value={jobForm.location}
                    onChange={(e) => setJobForm((f) => ({ ...f, location: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Salary Range</label>
                  <input
                    type="text"
                    value={jobForm.salaryRange}
                    onChange={(e) => setJobForm((f) => ({ ...f, salaryRange: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Experience Level</label>
                  <select
                    value={jobForm.experienceLevel}
                    onChange={(e) => setJobForm((f) => ({ ...f, experienceLevel: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  >
                    <option value="Internship">Internship</option>
                    <option value="Entry Level">Entry Level</option>
                    <option value="Associate">Associate</option>
                    <option value="Senior">Senior</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Min Years Experience</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={jobForm.minYearsExperience}
                    onChange={(e) => setJobForm((f) => ({ ...f, minYearsExperience: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Role Description</label>
                <textarea
                  rows={3}
                  required
                  value={jobForm.description}
                  onChange={(e) => setJobForm((f) => ({ ...f, description: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Responsibilities (one per line)</label>
                <textarea
                  rows={3}
                  value={jobForm.responsibilitiesText}
                  onChange={(e) => setJobForm((f) => ({ ...f, responsibilitiesText: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Required Technical Skills (comma separated)</label>
                  <input
                    type="text"
                    value={jobForm.requiredSkillsText}
                    onChange={(e) => setJobForm((f) => ({ ...f, requiredSkillsText: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Preferred &amp; Soft Skills</label>
                  <input
                    type="text"
                    value={jobForm.preferredSkillsText}
                    onChange={(e) => setJobForm((f) => ({ ...f, preferredSkillsText: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={jobForm.blindMode}
                  onChange={(e) => setJobForm((f) => ({ ...f, blindMode: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span>Enable Blind Initial Screening (hide candidate names &amp; contact info)</span>
              </label>

              {jobMsg && <p className="text-xs font-medium text-blue-700 dark:text-blue-400">{jobMsg}</p>}

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="btn-glossy-teal rounded-full px-5 py-2 text-xs font-bold"
                >
                  {editingJobId ? 'Save Changes' : 'Publish Job'}
                </button>
                {editingJobId && (
                  <button
                    type="button"
                    onClick={() => setEditingJobId(null)}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-xs dark:border-slate-700"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
            </form>

            {/* Posted Jobs List */}
            <div className="lg:col-span-6 space-y-3">
              {jobs.map((job) => (
                <div key={job.id} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-slate-950 dark:text-white">{job.title}</h3>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {job.company} · {job.location} · Status:{' '}
                        <span className={job.status === 'active' ? 'font-semibold text-emerald-700 dark:text-emerald-400' : 'font-semibold text-amber-700'}>
                          {job.status}
                        </span>
                      </p>
                    </div>
                    <span className="font-mono text-xs text-slate-600 dark:text-slate-300">
                      {job.applicantCount ?? 0} applicants
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                    Required: {job.requiredSkills.join(' · ')}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => handleEditJob(job)}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                    >
                      <Edit3 className="h-3 w-3" /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleJob(job.id)}
                      className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                    >
                      {job.status === 'active' ? 'Pause Job' : 'Activate Job'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteJob(job.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400"
                    >
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* BULK RESUME SCREENING TAB */}
      {activeTab === 'bulk-upload' && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-950 dark:text-white">Bulk Resume Upload &amp; AI Screening</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Upload multiple PDF, DOCX, or TXT resumes simultaneously. CareerMatch validates files, detects duplicates via content hashing, masks PII, and ranks candidates with explainable breakdowns.
            </p>
          </div>

          <form onSubmit={handleBulkUpload} className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 space-y-5">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Target Job Opening</label>
              <select
                value={bulkJobId}
                onChange={(e) => setBulkJobId(e.target.value ? Number(e.target.value) : '')}
                className="mt-1.5 w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title} ({j.company})
                  </option>
                ))}
              </select>
            </div>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const dropped = Array.from(e.dataTransfer.files || []);
                if (dropped.length > 0) setBulkFiles((prev) => [...prev, ...dropped]);
              }}
              className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/70 p-8 text-center dark:border-slate-700 dark:bg-slate-950/40"
            >
              <Upload className="mx-auto h-8 w-8 text-blue-700 dark:text-blue-400" />
              <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
                Drag &amp; drop multiple PDF or DOCX resumes here
              </p>
              <p className="mt-1 text-xs text-slate-500">Up to 20 files per batch · Automatic SHA-256 duplicate detection</p>
              <label className="mt-4 inline-block cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                Select Resume Files
                <input
                  type="file"
                  multiple
                  accept=".pdf,.docx,.txt"
                  className="hidden"
                  onChange={(e) => setBulkFiles((prev) => [...prev, ...Array.from(e.target.files || [])])}
                />
              </label>
            </div>

            {bulkFiles.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Queued Files ({bulkFiles.length})</p>
                <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                  {bulkFiles.map((f, idx) => (
                    <div key={`${f.name}-${idx}`} className="flex items-center justify-between px-3 py-2 text-xs">
                      <span>{f.name} ({Math.round(f.size / 1024)} KB)</span>
                      <button
                        type="button"
                        onClick={() => setBulkFiles((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {bulkError && <p className="text-xs font-medium text-red-600">{bulkError}</p>}

            <button
              type="submit"
              disabled={bulkUploading || bulkFiles.length === 0}
              className="btn-glossy-teal rounded-full px-6 py-2.5 text-xs font-bold disabled:opacity-50"
            >
              {bulkUploading ? 'Extracting & Screening Batch...' : 'Run Automated AI Screening'}
            </button>
          </form>

          {bulkResults.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-950 dark:text-white">Batch Screening Results</h2>
                <button
                  onClick={() => setActiveTab('candidates')}
                  className="text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400"
                >
                  View Ranked Candidates →
                </button>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {bulkResults.map((r, i) => (
                  <div key={i} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs">
                    <span className="font-medium text-slate-900 dark:text-white">{String(r.filename)}</span>
                    {r.status === 'screened' && (
                      <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                        Screened as #{String(r.anonymizedCode)} · {String(r.matchScore)}% Match
                      </span>
                    )}
                    {r.status === 'duplicate' && (
                      <span className="font-medium text-amber-700 dark:text-amber-400">{String(r.message)}</span>
                    )}
                    {r.status === 'error' && (
                      <span className="font-medium text-red-600">{String(r.error)}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* CANDIDATE RANKING, EXPLAINABLE AI & MANAGEMENT TAB */}
      {activeTab === 'candidates' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-950 dark:text-white">Candidate Ranking &amp; Explainable AI</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Inspect match score calculations, verify semantic skills, and record human hiring decisions.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setBlindModeView((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${
                  blindModeView
                    ? 'border-blue-600 bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-200'
                    : 'border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-300'
                }`}
              >
                {blindModeView ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {blindModeView ? 'Blind Screening: ON' : 'Blind Screening: Respect Job Default'}
              </button>
              <button
                type="button"
                onClick={() => handleAuthenticatedDownload('/api/recruiter/export-report', 'CareerMatch_Candidate_Report.csv')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Export CSV Report
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-4 dark:border-slate-800 dark:bg-slate-900">
            <select
              value={filterJobId}
              onChange={(e) => setFilterJobId(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="all">All Job Postings</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>{j.title}</option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="all">All Statuses</option>
              <option value="submitted">Submitted</option>
              <option value="screening">Screening</option>
              <option value="shortlisted">Shortlisted</option>
              <option value="interview">Interview</option>
              <option value="offered">Offered</option>
              <option value="rejected">Rejected</option>
            </select>
            <select
              value={filterMinScore}
              onChange={(e) => setFilterMinScore(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="0">Any Match Score</option>
              <option value="70">70%+ Match</option>
              <option value="85">85%+ Match</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="match">Sort by Overall Match</option>
              <option value="skills">Sort by Skills Match</option>
              <option value="experience">Sort by Experience Match</option>
              <option value="recent">Sort by Most Recent</option>
            </select>
          </div>

          {/* Candidate Comparison Strip */}
          {comparedPair.length === 2 && (
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 360, damping: 26 }}
              className="surface-specular-card rounded-2xl border border-teal-200 bg-teal-50/40 p-5 dark:border-teal-900/50 dark:bg-teal-950/20"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-950 dark:text-white">Side-by-Side Candidate Comparison</h2>
                <button onClick={() => setCompareIds([])} className="text-xs font-medium text-slate-500 hover:underline">
                  Clear Comparison
                </button>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                {comparedPair.map((c) => (
                  <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-4 text-xs dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 dark:text-white">{c.displayName}</span>
                      <span className="font-mono font-bold text-[#198F90] dark:text-[#20B4B6]">{c.match_score}% Match</span>
                    </div>
                    <p className="mt-1 text-slate-500">
                      Skills: {c.skills_match}% · Experience: {c.experience_match}% · Education: {c.education_match}%
                    </p>
                    <p className="mt-2 text-slate-700 dark:text-slate-300">
                      Matched: {(c.explainable?.matchedSkills || []).join(', ') || 'None'}
                    </p>
                    <p className="mt-1 text-red-600 dark:text-red-400">
                      Missing: {(c.explainable?.missingSkills || []).join(', ') || 'None'}
                    </p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Ranked Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Compare</th>
                  <th className="px-4 py-3 font-medium">Candidate</th>
                  <th className="px-4 py-3 font-medium">Job Role</th>
                  <th className="px-4 py-3 font-medium text-right">Match %</th>
                  <th className="px-4 py-3 font-medium text-right">Skills</th>
                  <th className="px-4 py-3 font-medium text-right">Exp</th>
                  <th className="px-4 py-3 font-medium text-right">Edu</th>
                  <th className="px-4 py-3 font-medium">Missing Skills</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {candidates.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                      No candidates match your current filters.
                    </td>
                  </tr>
                ) : (
                  candidates.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedCandidateId(c.id)}
                      className={`cursor-pointer transition-colors ${
                        activeCandidate?.id === c.id
                          ? 'bg-blue-50/70 dark:bg-blue-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={compareIds.includes(c.id)}
                          onChange={() => toggleCompareCandidate(c.id)}
                          aria-label={`Compare ${c.displayName}`}
                        />
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-950 dark:text-white">
                        {c.is_favorite && <Star className="mr-1 inline h-3.5 w-3.5 fill-amber-400 text-amber-500" />}
                        {c.displayName}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{c.job_title}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-blue-700 dark:text-blue-400">
                        {c.match_score}%
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">{c.skills_match}%</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">{c.experience_match}%</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">{c.education_match}%</td>
                      <td className="px-4 py-3 text-slate-500">
                        {(c.explainable?.missingSkills || []).join(', ') || 'None'}
                      </td>
                      <td className="px-4 py-3 font-medium capitalize text-slate-800 dark:text-slate-200">{c.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Selected Candidate Explainable Profile & Management */}
          {activeCandidate && (
            <motion.div
              key={activeCandidate.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              className="grid grid-cols-1 gap-6 lg:grid-cols-12"
            >
              <div className="surface-specular-card lg:col-span-7 space-y-5 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold text-slate-950 dark:text-white">{activeCandidate.displayName}</h2>
                      {activeCandidate.isBlind && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400">
                          <ShieldCheck className="h-3.5 w-3.5" /> Identity Masked
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {activeCandidate.job_title} · Email: {activeCandidate.contactEmail}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleUpdateCandidateStatus({ isFavorite: !activeCandidate.is_favorite }, 'Favorite updated.')}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium dark:border-slate-700"
                    >
                      {activeCandidate.is_favorite ? 'Favorited' : 'Add Favorite'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleAuthenticatedDownload(
                          `/api/recruiter/candidates/${activeCandidate.id}/resume-download`,
                          activeCandidate.original_filename.replace(/\.[^.]+$/, '.txt')
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium dark:border-slate-700"
                    >
                      <Download className="h-3.5 w-3.5" /> Download Resume
                    </button>
                  </div>
                </div>

                {/* Explainable AI Breakdown */}
                <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-4 dark:border-blue-900/50 dark:bg-blue-950/20 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-blue-950 dark:text-blue-200">Explainable AI Score Breakdown</span>
                    <span className="font-mono font-bold tabular-nums text-blue-700 dark:text-blue-400">
                      {activeCandidate.match_score}% Overall
                    </span>
                  </div>
                  <p className="text-slate-700 dark:text-slate-300">{activeCandidate.explainable?.explanation}</p>
                  <p className="text-slate-500 dark:text-slate-400">
                    Formula: Skills ({activeCandidate.explainable?.breakdown?.skillsWeight ?? 55}% × {activeCandidate.skills_match}%) + Experience ({activeCandidate.explainable?.breakdown?.experienceWeight ?? 25}% × {activeCandidate.experience_match}%) + Education ({activeCandidate.explainable?.breakdown?.educationWeight ?? 20}% × {activeCandidate.education_match}%)
                  </p>
                  <div className="grid grid-cols-1 gap-2 pt-2 sm:grid-cols-2">
                    <div>
                      <p className="font-semibold text-emerald-800 dark:text-emerald-300">Matched Skills</p>
                      <p className="mt-0.5 text-slate-700 dark:text-slate-300">
                        {(activeCandidate.explainable?.matchedSkills || []).join(', ') || 'None'}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold text-red-700 dark:text-red-400">Missing Skills</p>
                      <p className="mt-0.5 text-slate-700 dark:text-slate-300">
                        {(activeCandidate.explainable?.missingSkills || []).join(', ') || 'None'}
                      </p>
                    </div>
                  </div>
                  {(activeCandidate.explainable?.relevantProjects || []).length > 0 && (
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">Relevant Projects &amp; Experience</p>
                      <ul className="mt-1 list-disc pl-4 text-slate-600 dark:text-slate-300">
                        {activeCandidate.explainable.relevantProjects.map((p, i) => <li key={i}>{p}</li>)}
                        {(activeCandidate.explainable.relevantExperience || []).map((e, i) => <li key={`e-${i}`}>{e}</li>)}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Fair Recruitment: Manual Skill Correction */}
                <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800 space-y-2">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">
                    Human-in-the-Loop Skill Verification (Manual Correction)
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Edit extracted skills if the parser missed domain context, then recalculate match score transparently.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={skillEditText}
                      onChange={(e) => setSkillEditText(e.target.value)}
                      className="flex-1 min-w-[220px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={handleRecalculateSkills}
                      className="btn-glossy-teal rounded-full px-4 py-1.5 text-xs font-bold"
                    >
                      Recalculate Score
                    </button>
                  </div>
                </div>

                {/* Resume Preview */}
                <div>
                  <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Resume Text Preview {activeCandidate.isBlind ? '(Anonymized for Fair Screening)' : ''}
                  </h3>
                  <pre className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-[11px] leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                    {activeCandidate.resumePreviewText}
                  </pre>
                </div>
              </div>

              {/* Right Column: Actions, Notes, Feedback & Interview Question Generator */}
              <div className="lg:col-span-5 space-y-5">
                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-4">
                  <h3 className="text-base font-bold text-slate-950 dark:text-white">Hiring Decision &amp; Feedback</h3>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleUpdateCandidateStatus({ status: 'shortlisted', revealIdentity: true }, 'Candidate shortlisted & identity revealed.')}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600"
                    >
                      <Check className="h-3.5 w-3.5" /> Shortlist
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateCandidateStatus({ status: 'interview', interviewDate: interviewDateDraft || 'TBD (Scheduled via CareerMatch)', revealIdentity: true }, 'Moved to Interview stage.')}
                      className="btn-glossy-teal rounded-full px-4 py-2 text-xs font-bold"
                    >
                      Invite to Interview
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateCandidateStatus({ status: 'rejected' }, 'Candidate status updated to Rejected.')}
                      className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400"
                    >
                      Reject
                    </button>
                    {activeCandidate.isBlind && (
                      <button
                        type="button"
                        onClick={() => handleUpdateCandidateStatus({ revealIdentity: true }, 'Candidate identity revealed after review.')}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium dark:border-slate-700"
                      >
                        Reveal Identity
                      </button>
                    )}
                  </div>

                  <div className="space-y-3 border-t border-slate-200 pt-3 text-xs dark:border-slate-800">
                    <div>
                      <label className="block font-medium text-slate-700 dark:text-slate-300">Interview Date / Slot</label>
                      <input
                        type="text"
                        value={interviewDateDraft}
                        onChange={(e) => setInterviewDateDraft(e.target.value)}
                        placeholder="e.g., Nov 18, 2026 at 2:00 PM PT"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 dark:text-slate-300">Internal Recruiter Notes (Private)</label>
                      <textarea
                        rows={2}
                        value={notesDraft}
                        onChange={(e) => setNotesDraft(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 dark:text-slate-300">Feedback Shared With Candidate</label>
                      <textarea
                        rows={2}
                        value={feedbackDraft}
                        onChange={(e) => setFeedbackDraft(e.target.value)}
                        placeholder="Constructive feedback visible in candidate's Application Tracker..."
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 dark:text-slate-300">Interview Outcome</label>
                      <input
                        type="text"
                        value={outcomeDraft}
                        onChange={(e) => setOutcomeDraft(e.target.value)}
                        placeholder="e.g., Passed Technical Screen"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateCandidateStatus(
                          {
                            recruiterNotes: notesDraft,
                            recruiterFeedback: feedbackDraft,
                            interviewDate: interviewDateDraft,
                            interviewOutcome: outcomeDraft,
                          },
                          'Notes & candidate feedback saved.'
                        )
                      }
                      className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2 font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      Save Notes &amp; Feedback
                    </button>
                    {candActionMsg && <p className="font-medium text-emerald-700 dark:text-emerald-400">{candActionMsg}</p>}
                  </div>
                </div>

                {/* Interview Question Generator */}
                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-950 dark:text-white">Tailored Interview Questions</h3>
                    <button
                      type="button"
                      onClick={handleGenerateQuestions}
                      disabled={questionsLoading}
                      className="btn-glossy-teal inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold"
                    >
                      <MessageSquarePlus className="h-3.5 w-3.5" />
                      {questionsLoading ? 'Generating...' : 'Generate Questions'}
                    </button>
                  </div>
                  {generatedQuestions.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      Generate role- and project-specific interview questions for this candidate.
                    </p>
                  ) : (
                    <ol className="space-y-2.5 text-xs text-slate-700 dark:text-slate-300">
                      {generatedQuestions.map((q) => (
                        <li key={q.index} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                          <span className="font-semibold text-[#198F90] dark:text-[#20B4B6]">{q.type}: </span>
                          {q.question}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </div>
      )}
    </PortalLayout>
  );
}
