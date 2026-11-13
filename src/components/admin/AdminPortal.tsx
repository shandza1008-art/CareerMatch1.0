import { useCallback, useEffect, useState } from 'react';
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
  Activity,
  AlertCircle,
  Briefcase,
  LayoutDashboard,
  Users,
} from 'lucide-react';
import { PortalLayout, NavItem } from '../PortalLayout';
import { apiRequest } from '../../lib/api';

interface AdminPortalProps {
  onGoHome: () => void;
}

export function AdminPortal({ onGoHome }: AdminPortalProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [overview, setOverview] = useState<{
    totalStudents: number;
    totalRecruiters: number;
    activeJobs: number;
    totalJobs: number;
    totalAnalyses: number;
    totalApplications: number;
    openIssues: number;
    usageBreakdown: Array<{ metric: string; count: number }>;
  } | null>(null);
  const [users, setUsers] = useState<Array<Record<string, unknown>>>([]);
  const [jobs, setJobs] = useState<Array<Record<string, unknown>>>([]);
  const [issues, setIssues] = useState<Array<Record<string, unknown>>>([]);
  const [activities, setActivities] = useState<Array<Record<string, unknown>>>([]);

  const loadAll = useCallback(async () => {
    const [ov, us, jb, is, ac] = await Promise.all([
      apiRequest<typeof overview>('/api/admin/overview'),
      apiRequest<Array<Record<string, unknown>>>('/api/admin/users'),
      apiRequest<Array<Record<string, unknown>>>('/api/admin/jobs'),
      apiRequest<Array<Record<string, unknown>>>('/api/admin/issues'),
      apiRequest<Array<Record<string, unknown>>>('/api/admin/activities'),
    ]);
    setOverview(ov);
    setUsers(us);
    setJobs(jb);
    setIssues(is);
    setActivities(ac);
  }, []);

  useEffect(() => {
    loadAll().catch(() => {});
  }, [loadAll]);

  const navItems: NavItem[] = [
    { id: 'overview', label: 'Platform Overview', icon: <LayoutDashboard className="h-4 w-4" /> },
    { id: 'users', label: 'Manage Users', icon: <Users className="h-4 w-4" /> },
    { id: 'jobs', label: 'Job Moderation', icon: <Briefcase className="h-4 w-4" /> },
    { id: 'issues', label: 'Reported Issues', icon: <AlertCircle className="h-4 w-4" /> },
    { id: 'activity', label: 'Activity Monitor', icon: <Activity className="h-4 w-4" /> },
  ];

  const handleToggleUserStatus = async (id: number, currentStatus: string) => {
    const next = currentStatus === 'active' ? 'suspended' : 'active';
    await apiRequest(`/api/admin/users/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: next }),
    });
    await loadAll();
  };

  const handleJobStatus = async (id: number, status: string) => {
    await apiRequest(`/api/admin/jobs/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    await loadAll();
  };

  const handleDeleteJob = async (id: number) => {
    await apiRequest(`/api/admin/jobs/${id}`, { method: 'DELETE' });
    await loadAll();
  };

  const handleIssueStatus = async (id: number, status: string) => {
    await apiRequest(`/api/admin/issues/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, adminNotes: `Marked ${status} by administrator.` }),
    });
    await loadAll();
  };

  return (
    <PortalLayout
      portalTitle="Admin Console"
      navItems={navItems}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onGoHome={onGoHome}
    >
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-950 dark:text-white">Platform Administration</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Monitor registered users, active postings, AI analyses, and reported platform issues.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            {[
              { label: 'Registered Students', val: overview?.totalStudents ?? 0 },
              { label: 'Registered Recruiters', val: overview?.totalRecruiters ?? 0 },
              { label: 'Active Job Postings', val: overview?.activeJobs ?? 0 },
              { label: 'Total Resume Analyses', val: overview?.totalAnalyses ?? 0 },
              { label: 'Open Issues', val: overview?.openIssues ?? 0 },
            ].map((s, idx) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 14, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                whileHover={{ y: -3 }}
                transition={{ type: 'spring', stiffness: 360, damping: 24, delay: idx * 0.04 }}
                className="surface-specular-card rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
              >
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{s.label}</p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-[#198F90] dark:text-[#20B4B6]">{s.val}</p>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26, delay: 0.14 }}
            className="surface-specular-card rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">Platform Usage Statistics</h2>
            <div className="mt-4 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={overview?.usageBreakdown || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="metric" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#198F90" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold text-slate-950 dark:text-white">Manage Users</h1>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {users.map((u) => (
                  <tr key={String(u.id)}>
                    <td className="px-4 py-3 font-semibold text-slate-950 dark:text-white">{String(u.full_name)}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{String(u.email)}</td>
                    <td className="px-4 py-3 capitalize">{String(u.role)}</td>
                    <td className="px-4 py-3">
                      <span className={u.status === 'active' ? 'font-semibold text-emerald-700 dark:text-emerald-400' : 'font-semibold text-red-600'}>
                        {String(u.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {u.role !== 'admin' && (
                        <button
                          type="button"
                          onClick={() => handleToggleUserStatus(Number(u.id), String(u.status))}
                          className="rounded-md border border-slate-300 px-3 py-1 font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                        >
                          {u.status === 'active' ? 'Suspend' : 'Activate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'jobs' && (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold text-slate-950 dark:text-white">Manage Job Postings</h1>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Recruiter</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {jobs.map((j) => (
                  <tr key={String(j.id)}>
                    <td className="px-4 py-3 font-semibold text-slate-950 dark:text-white">{String(j.title)}</td>
                    <td className="px-4 py-3">{String(j.company)}</td>
                    <td className="px-4 py-3 text-slate-500">{String(j.recruiter_name)}</td>
                    <td className="px-4 py-3 capitalize font-medium">{String(j.status)}</td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => handleJobStatus(Number(j.id), j.status === 'active' ? 'paused' : 'active')}
                        className="rounded-md border border-slate-300 px-2.5 py-1 dark:border-slate-700"
                      >
                        {j.status === 'active' ? 'Pause' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteJob(Number(j.id))}
                        className="rounded-md border border-red-200 px-2.5 py-1 text-red-600 dark:border-red-900/50"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'issues' && (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold text-slate-950 dark:text-white">Reported Issues</h1>
          <div className="space-y-3">
            {issues.map((issue) => (
              <div key={String(issue.id)} className="rounded-xl border border-slate-200 bg-white p-5 text-xs dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-950 dark:text-white">{String(issue.subject)}</h3>
                  <span className="font-semibold capitalize text-blue-700 dark:text-blue-400">{String(issue.status)}</span>
                </div>
                <p className="mt-1 text-slate-500">
                  Reported by {String(issue.reporter_name || 'User')} ({String(issue.reporter_role || 'member')}) · {String(issue.created_at).slice(0, 10)}
                </p>
                <p className="mt-2 text-slate-700 dark:text-slate-300">{String(issue.description)}</p>
                {issue.status === 'open' && (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleIssueStatus(Number(issue.id), 'resolved')}
                      className="btn-glossy-teal rounded-full px-4 py-1.5 font-bold"
                    >
                      Mark Resolved
                    </button>
                    <button
                      type="button"
                      onClick={() => handleIssueStatus(Number(issue.id), 'dismissed')}
                      className="rounded-md border border-slate-300 px-3 py-1.5 dark:border-slate-700"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold text-slate-950 dark:text-white">System Activity Monitor</h1>
          <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:divide-slate-800">
            {activities.map((a) => (
              <div key={String(a.id)} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-xs">
                <div>
                  <span className="font-semibold text-slate-900 dark:text-white">{String(a.user_name || 'System')}</span>
                  <span className="mx-2 text-slate-400">·</span>
                  <span className="text-slate-600 dark:text-slate-300">{String(a.details)}</span>
                </div>
                <span className="font-mono text-slate-400">{String(a.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </PortalLayout>
  );
}
