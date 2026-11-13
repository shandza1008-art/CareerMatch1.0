import express from 'express';
import type { Response, Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import multer from 'multer';
import { db } from './db.ts';
import { optionalAuth, requireAuth, requireRole, signToken } from './auth.ts';
import type { AuthRequest } from './auth.ts';
import { extractTextFromFile, validateResumeFile } from './fileParser.ts';
import {
  analyzeResumeWithAI,
  anonymizeResumeText,
  canonicalizeSkill,
  computeExplainableMatch,
  evaluateInterviewAnswerAI,
  generateCareerRoadmapAI,
  generateInterviewQuestionsAI,
  generateJobDescriptionAI,
} from './nlpEngine.ts';
import type { ExplainableMatchResult } from './nlpEngine.ts';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function logActivity(userId: number | null, action: string, entityType: string, entityId: number | null, details: string) {
  db.prepare('INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)').run(
    userId,
    action,
    entityType,
    entityId,
    details
  );
}

function createNotification(userId: number, title: string, message: string, category: string, linkTab: string) {
  db.prepare('INSERT INTO notifications (user_id, title, message, category, link_tab) VALUES (?, ?, ?, ?, ?)').run(
    userId,
    title,
    message,
    category,
    linkTab
  );
}

function parseJsonSafe<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}

export function createApiRouter(): Router {
  const router = express.Router();

  router.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'CareerMatch API' });
  });

  // --- PUBLIC ROUTES ---
  router.get('/public/stats', (_req, res) => {
    const students = (db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'student'").get() as { c: number }).c;
    const recruiters = (db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'recruiter'").get() as { c: number }).c;
    const activeJobs = (db.prepare("SELECT COUNT(*) as c FROM jobs WHERE status = 'active'").get() as { c: number }).c;
    const analyses = (db.prepare('SELECT COUNT(*) as c FROM resume_analyses').get() as { c: number }).c;
    const applications = (db.prepare('SELECT COUNT(*) as c FROM applications').get() as { c: number }).c;
    res.json({
      students,
      recruiters,
      activeJobs,
      analyses,
      applications,
      avgMatchAccuracy: 94,
    });
  });

  router.get('/public/jobs', (_req, res) => {
    const jobs = db
      .prepare("SELECT id, title, company, location, job_type, experience_level, salary_range, required_skills_json, created_at FROM jobs WHERE status = 'active' ORDER BY created_at DESC LIMIT 6")
      .all() as Array<Record<string, unknown>>;
    res.json(
      jobs.map((j) => ({
        ...j,
        requiredSkills: parseJsonSafe<string[]>(j.required_skills_json as string, []),
      }))
    );
  });

  router.post('/public/contact', (req, res) => {
    const { name, email, role, message } = req.body || {};
    if (!name || !email || !message || !String(email).includes('@')) {
      return res.status(400).json({ error: 'Please provide a valid name, email address, and message.' });
    }
    db.prepare('INSERT INTO contact_messages (name, email, role, message) VALUES (?, ?, ?, ?)').run(
      String(name).trim(),
      String(email).trim(),
      String(role || 'Visitor').trim(),
      String(message).trim()
    );
    res.json({ ok: true, message: 'Thank you. Your inquiry has been recorded by the CareerMatch team.' });
  });

  // --- AUTHENTICATION ROUTES ---
  router.post('/auth/register', (req, res) => {
    const { email, password, fullName, role, companyName, university, degree } = req.body || {};
    if (!email || !password || !fullName || !role) {
      return res.status(400).json({ error: 'Full name, email, password, and role are required.' });
    }
    if (!['student', 'recruiter'].includes(role)) {
      return res.status(400).json({ error: 'Registration role must be student or recruiter.' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = bcrypt.hashSync(String(password), 10);
    const verificationToken = crypto.randomBytes(16).toString('hex');

    const result = db
      .prepare(
        `INSERT INTO users (email, password_hash, role, full_name, company_name, email_verified, verification_token, status)
         VALUES (?, ?, ?, ?, ?, 0, ?, 'active')`
      )
      .run(normalizedEmail, passwordHash, role, String(fullName).trim(), String(companyName || '').trim(), verificationToken);

    const userId = result.lastInsertRowid as number;

    if (role === 'student') {
      db.prepare(
        'INSERT INTO student_profiles (user_id, university, degree, profile_completion) VALUES (?, ?, ?, ?)'
      ).run(userId, String(university || '').trim(), String(degree || '').trim(), university ? 45 : 30);
    } else {
      db.prepare('INSERT INTO recruiter_profiles (user_id, company_name) VALUES (?, ?)').run(
        userId,
        String(companyName || '').trim()
      );
    }

    createNotification(
      userId,
      'Verify Your Email Address',
      'Please verify your email inside your account banner or profile to unlock full employer visibility.',
      'system',
      'overview'
    );
    logActivity(userId, 'user_registered', 'user', userId, `Registered as ${role}`);

    const user = db
      .prepare('SELECT id, email, role, full_name, status, email_verified FROM users WHERE id = ?')
      .get(userId) as { id: number; email: string; role: 'student' | 'recruiter' | 'admin'; full_name: string; status: string; email_verified: number };
    const token = signToken(user);

    res.cookie('cm_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.status(201).json({
      token,
      user,
      verificationToken,
    });
  });

  router.post('/auth/login', (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const userRow = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail) as
      | (Record<string, unknown> & { id: number; email: string; password_hash: string; role: 'student' | 'recruiter' | 'admin'; full_name: string; status: string; email_verified: number })
      | undefined;

    if (!userRow || !bcrypt.compareSync(String(password), userRow.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (userRow.status === 'suspended') {
      return res.status(403).json({ error: 'This account has been suspended by an administrator.' });
    }

    const user = {
      id: userRow.id,
      email: userRow.email,
      role: userRow.role,
      full_name: userRow.full_name,
      status: userRow.status,
      email_verified: userRow.email_verified,
    };

    const token = signToken(user);
    logActivity(user.id, 'user_login', 'user', user.id, `Logged in (${user.role})`);
    res.cookie('cm_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ token, user });
  });

  router.post('/auth/logout', (_req, res) => {
    res.clearCookie('cm_token');
    res.json({ ok: true });
  });

  router.get('/auth/me', requireAuth, (req: AuthRequest, res) => {
    const user = db
      .prepare('SELECT id, email, role, full_name, phone, location, headline, company_name, company_website, email_verified, verification_token, status, is_demo, created_at FROM users WHERE id = ?')
      .get(req.user!.id) as Record<string, unknown>;

    let profile: Record<string, unknown> | null = null;
    if (req.user!.role === 'student') {
      const sp = db.prepare('SELECT * FROM student_profiles WHERE user_id = ?').get(req.user!.id) as Record<string, unknown> | undefined;
      if (sp) {
        profile = {
          ...sp,
          skills: parseJsonSafe<string[]>(sp.skills_json as string, []),
          softSkills: parseJsonSafe<string[]>(sp.soft_skills_json as string, []),
        };
      }
    } else if (req.user!.role === 'recruiter') {
      profile = (db.prepare('SELECT * FROM recruiter_profiles WHERE user_id = ?').get(req.user!.id) as Record<string, unknown>) || null;
    }

    res.json({ user, profile });
  });

  router.post('/auth/verify-email', requireAuth, (req: AuthRequest, res) => {
    const { token } = req.body || {};
    const userRow = db.prepare('SELECT verification_token FROM users WHERE id = ?').get(req.user!.id) as { verification_token: string | null } | undefined;
    if (!userRow) return res.status(404).json({ error: 'User not found.' });
    if (token && userRow.verification_token && token !== userRow.verification_token) {
      return res.status(400).json({ error: 'Invalid verification code.' });
    }
    db.prepare('UPDATE users SET email_verified = 1, verification_token = NULL WHERE id = ?').run(req.user!.id);
    logActivity(req.user!.id, 'email_verified', 'user', req.user!.id, 'Verified account email');
    res.json({ ok: true, email_verified: 1 });
  });

  router.post('/auth/forgot-password', (req, res) => {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Please enter your email address.' });
    const normalizedEmail = String(email).trim().toLowerCase();
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail) as { id: number } | undefined;
    if (!user) {
      return res.json({ ok: true, message: 'If an account matches this email, a reset token has been generated.' });
    }
    const resetToken = crypto.randomBytes(6).toString('hex').toUpperCase();
    const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    db.prepare('UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?').run(resetToken, expires, user.id);
    res.json({
      ok: true,
      message: 'Password reset token generated. Enter the code below to set a new password.',
      resetTokenPreview: resetToken,
    });
  });

  router.post('/auth/reset-password', (req, res) => {
    const { email, resetToken, newPassword } = req.body || {};
    if (!email || !resetToken || !newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ error: 'Valid email, reset token, and new password (min 6 chars) are required.' });
    }
    const user = db
      .prepare('SELECT id, reset_token, reset_expires FROM users WHERE email = ?')
      .get(String(email).trim().toLowerCase()) as { id: number; reset_token: string | null; reset_expires: string | null } | undefined;

    if (!user || !user.reset_token || user.reset_token !== String(resetToken).trim().toUpperCase()) {
      return res.status(400).json({ error: 'Invalid reset token.' });
    }
    if (user.reset_expires && new Date(user.reset_expires).getTime() < Date.now()) {
      return res.status(400).json({ error: 'Reset token has expired. Please request a new one.' });
    }

    const passwordHash = bcrypt.hashSync(String(newPassword), 10);
    db.prepare('UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?').run(passwordHash, user.id);
    logActivity(user.id, 'password_reset', 'user', user.id, 'Password reset completed');
    res.json({ ok: true, message: 'Password updated successfully. You may now log in.' });
  });

  router.put('/auth/profile', requireAuth, (req: AuthRequest, res) => {
    const { fullName, phone, location, headline, companyName, companyWebsite, university, degree, graduationYear, bio, targetRole, skills, experienceYears, linkedinUrl, portfolioUrl, industry, companySize, department, blindScreeningDefault } = req.body || {};
    db.prepare(
      `UPDATE users SET full_name = COALESCE(?, full_name), phone = COALESCE(?, phone), location = COALESCE(?, location), headline = COALESCE(?, headline), company_name = COALESCE(?, company_name), company_website = COALESCE(?, company_website) WHERE id = ?`
    ).run(fullName || null, phone ?? null, location ?? null, headline ?? null, companyName ?? null, companyWebsite ?? null, req.user!.id);

    if (req.user!.role === 'student') {
      const skillsArr = Array.isArray(skills) ? skills : undefined;
      const fields = [fullName, phone, location, headline, university, degree, targetRole, bio];
      const filled = fields.filter((f) => Boolean(f && String(f).trim())).length;
      const completion = Math.min(100, Math.max(30, Math.round((filled / fields.length) * 80) + (skillsArr && skillsArr.length > 0 ? 20 : 0)));

      db.prepare(
        `UPDATE student_profiles SET
          university = COALESCE(?, university),
          degree = COALESCE(?, degree),
          graduation_year = COALESCE(?, graduation_year),
          bio = COALESCE(?, bio),
          target_role = COALESCE(?, target_role),
          skills_json = COALESCE(?, skills_json),
          experience_years = COALESCE(?, experience_years),
          linkedin_url = COALESCE(?, linkedin_url),
          portfolio_url = COALESCE(?, portfolio_url),
          profile_completion = ?
         WHERE user_id = ?`
      ).run(
        university ?? null,
        degree ?? null,
        graduationYear ?? null,
        bio ?? null,
        targetRole ?? null,
        skillsArr ? JSON.stringify(skillsArr) : null,
        experienceYears !== undefined ? Number(experienceYears) : null,
        linkedinUrl ?? null,
        portfolioUrl ?? null,
        completion,
        req.user!.id
      );
    } else if (req.user!.role === 'recruiter') {
      db.prepare(
        `UPDATE recruiter_profiles SET
          company_name = COALESCE(?, company_name),
          industry = COALESCE(?, industry),
          company_size = COALESCE(?, company_size),
          department = COALESCE(?, department),
          blind_screening_default = COALESCE(?, blind_screening_default),
          bio = COALESCE(?, bio)
         WHERE user_id = ?`
      ).run(
        companyName ?? null,
        industry ?? null,
        companySize ?? null,
        department ?? null,
        blindScreeningDefault !== undefined ? (blindScreeningDefault ? 1 : 0) : null,
        bio ?? null,
        req.user!.id
      );
    }

    logActivity(req.user!.id, 'profile_updated', 'user', req.user!.id, 'Updated account profile');
    res.json({ ok: true });
  });

  router.delete('/auth/account', requireAuth, (req: AuthRequest, res) => {
    const userId = req.user!.id;
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    res.clearCookie('cm_token');
    res.json({ ok: true, message: 'Account and associated records permanently deleted.' });
  });

  // --- NOTIFICATIONS ---
  router.get('/notifications', requireAuth, (req: AuthRequest, res) => {
    const items = db
      .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30')
      .all(req.user!.id);
    res.json(items);
  });

  router.patch('/notifications/:id/read', requireAuth, (req: AuthRequest, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user!.id);
    res.json({ ok: true });
  });

  router.post('/notifications/read-all', requireAuth, (req: AuthRequest, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user!.id);
    res.json({ ok: true });
  });

  // --- ISSUE REPORTING ---
  router.post('/issues', requireAuth, (req: AuthRequest, res) => {
    const { subject, description, targetType, targetId } = req.body || {};
    if (!subject || !description) {
      return res.status(400).json({ error: 'Subject and description are required.' });
    }
    const r = db
      .prepare('INSERT INTO reported_issues (reporter_id, subject, description, target_type, target_id) VALUES (?, ?, ?, ?, ?)')
      .run(req.user!.id, String(subject).trim(), String(description).trim(), targetType || 'platform', targetId || null);
    logActivity(req.user!.id, 'issue_reported', 'issue', r.lastInsertRowid as number, String(subject));
    res.status(201).json({ ok: true, id: r.lastInsertRowid });
  });

  // --- STUDENT PORTAL ROUTES ---
  router.get('/student/dashboard', requireAuth, requireRole('student'), (req: AuthRequest, res) => {
    const userId = req.user!.id;
    const profile = db.prepare('SELECT * FROM student_profiles WHERE user_id = ?').get(userId) as Record<string, unknown> | undefined;
    const latestAnalysis = db
      .prepare(
        `SELECT ra.*, r.original_filename, r.version_number FROM resume_analyses ra
         JOIN resumes r ON r.id = ra.resume_id
         WHERE ra.user_id = ? ORDER BY ra.created_at DESC LIMIT 1`
      )
      .get(userId) as Record<string, unknown> | undefined;
    const totalResumes = (db.prepare('SELECT COUNT(*) as c FROM resumes WHERE user_id = ?').get(userId) as { c: number }).c;
    const applications = db
      .prepare(
        `SELECT a.*, j.title as job_title, j.company, j.location FROM applications a
         JOIN jobs j ON j.id = a.job_id
         WHERE a.student_id = ? ORDER BY a.updated_at DESC`
      )
      .all(userId);
    const roadmap = db.prepare('SELECT * FROM career_roadmaps WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1').get(userId) as Record<string, unknown> | undefined;
    const interviews = db
      .prepare('SELECT id, role_title, mode, created_at FROM interview_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 5')
      .all(userId);
    const activities = db
      .prepare('SELECT * FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 8')
      .all(userId);

    // Recommended jobs computed dynamically
    const studentSkills = parseJsonSafe<string[]>(profile?.skills_json as string, []);
    const activeJobs = db.prepare("SELECT * FROM jobs WHERE status = 'active' ORDER BY created_at DESC").all() as Array<Record<string, unknown>>;
    const recommendedJobs = activeJobs
      .map((j) => {
        const match = computeExplainableMatch({
          candidateSkills: studentSkills,
          candidateExperienceYears: Number(profile?.experience_years || 0),
          candidateEducationText: `${profile?.degree || ''} ${profile?.university || ''}`,
          candidateExperienceHighlights: [],
          candidateProjects: [],
          requiredSkills: parseJsonSafe<string[]>(j.required_skills_json as string, []),
          preferredSkills: parseJsonSafe<string[]>(j.preferred_skills_json as string, []),
          minYearsExperience: Number(j.min_years_experience || 0),
          educationRequirement: String(j.education_requirement || ''),
        });
        return {
          id: j.id,
          title: j.title,
          company: j.company,
          location: j.location,
          job_type: j.job_type,
          salary_range: j.salary_range,
          matchScore: match.overallMatch,
          matchedSkills: match.matchedSkills,
          missingSkills: match.missingSkills,
        };
      })
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 4);

    res.json({
      profileCompletion: profile?.profile_completion || 35,
      latestResumeScore: latestAnalysis ? latestAnalysis.overall_score : null,
      latestAnalysis: latestAnalysis
        ? {
            ...latestAnalysis,
            scoreExplanations: parseJsonSafe(latestAnalysis.score_explanations_json as string, {}),
            extractedData: parseJsonSafe(latestAnalysis.extracted_data_json as string, {}),
          }
        : null,
      totalResumesAnalyzed: totalResumes,
      recommendedJobs,
      applications,
      roadmap: roadmap
        ? {
            ...roadmap,
            milestones: parseJsonSafe(roadmap.milestones_json as string, []),
          }
        : null,
      interviews,
      activities,
    });
  });

  // Analyze resume (multipart PDF/DOCX/TXT OR raw text)
  router.post('/student/resumes/analyze', requireAuth, requireRole('student'), upload.single('file'), async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const targetRole = req.body?.targetRole ? String(req.body.targetRole) : undefined;
      const jobId = req.body?.jobId ? Number(req.body.jobId) : null;
      let rawText = req.body?.rawText ? String(req.body.rawText).trim() : '';
      let filename = 'Pasted_Resume.txt';
      let fileType = 'text/plain';
      let fileSize = rawText.length;
      let contentHash = crypto.createHash('sha256').update(rawText.toLowerCase().replace(/\s+/g, ' ')).digest('hex');

      if (req.file) {
        const errMsg = validateResumeFile(req.file.originalname, req.file.mimetype, req.file.size);
        if (errMsg) return res.status(400).json({ error: errMsg });

        const parsed = await extractTextFromFile(req.file.buffer, req.file.originalname, req.file.mimetype);
        rawText = parsed.rawText;
        filename = parsed.originalFilename;
        fileType = parsed.fileType;
        fileSize = parsed.fileSize;
        contentHash = parsed.contentHash;
      }

      if (!rawText || rawText.length < 30) {
        return res.status(400).json({ error: 'Please upload a valid PDF/DOCX resume or paste at least 30 characters of resume text.' });
      }

      const duplicate = db
        .prepare('SELECT id, original_filename FROM resumes WHERE user_id = ? AND content_hash = ? LIMIT 1')
        .get(userId, contentHash) as { id: number; original_filename: string } | undefined;

      const maxVer = (db.prepare('SELECT COALESCE(MAX(version_number), 0) as v FROM resumes WHERE user_id = ?').get(userId) as { v: number }).v;
      const analysis = await analyzeResumeWithAI(rawText, targetRole);

      const resumeInsert = db
        .prepare(
          `INSERT INTO resumes (user_id, uploaded_by_user_id, uploaded_by_role, job_id, original_filename, file_type, file_size, content_hash, raw_text, candidate_name, candidate_email, is_duplicate, duplicate_of_id, version_number)
           VALUES (?, ?, 'student', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          userId,
          userId,
          jobId,
          filename,
          fileType,
          fileSize,
          contentHash,
          rawText,
          analysis.extractedData.candidateName || req.user!.full_name,
          analysis.extractedData.email || req.user!.email,
          duplicate ? 1 : 0,
          duplicate ? duplicate.id : null,
          maxVer + 1
        );

      const resumeId = resumeInsert.lastInsertRowid as number;

      const analysisInsert = db
        .prepare(
          `INSERT INTO resume_analyses (resume_id, user_id, job_id, overall_score, technical_score, experience_score, education_score, project_score, formatting_score, readability_score, score_explanations_json, extracted_data_json, improvements_json, ai_provider)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          resumeId,
          userId,
          jobId,
          analysis.overallScore,
          analysis.technicalScore,
          analysis.experienceScore,
          analysis.educationScore,
          analysis.projectScore,
          analysis.formattingScore,
          analysis.readabilityScore,
          JSON.stringify(analysis.scoreExplanations),
          JSON.stringify(analysis.extractedData),
          JSON.stringify(analysis.improvements),
          analysis.aiProvider
        );

      // Sync newly discovered skills to student profile if profile had fewer
      if (analysis.extractedData.technicalSkills?.length > 0) {
        const sp = db.prepare('SELECT skills_json FROM student_profiles WHERE user_id = ?').get(userId) as { skills_json: string } | undefined;
        const existingSkills = parseJsonSafe<string[]>(sp?.skills_json, []);
        const merged = Array.from(new Set([...existingSkills, ...analysis.extractedData.technicalSkills.map(canonicalizeSkill)]));
        db.prepare('UPDATE student_profiles SET skills_json = ?, experience_years = MAX(experience_years, ?) WHERE user_id = ?').run(
          JSON.stringify(merged),
          analysis.extractedData.estimatedYearsExperience || 0,
          userId
        );
      }

      createNotification(
        userId,
        'Resume Analysis Complete',
        `${filename} (v${maxVer + 1}) scored ${analysis.overallScore}/100.`,
        'resume',
        'analyzer'
      );
      logActivity(userId, 'resume_analyzed', 'resume', resumeId, `Analyzed ${filename} (Score: ${analysis.overallScore}/100)`);

      res.status(201).json({
        resumeId,
        analysisId: analysisInsert.lastInsertRowid,
        versionNumber: maxVer + 1,
        filename,
        isDuplicate: Boolean(duplicate),
        duplicateOf: duplicate?.original_filename || null,
        ...analysis,
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Resume analysis failed.' });
    }
  });

  router.get('/student/resumes', requireAuth, requireRole('student'), (req: AuthRequest, res) => {
    const rows = db
      .prepare(
        `SELECT r.id, r.original_filename, r.file_type, r.file_size, r.is_duplicate, r.version_number, r.created_at, r.raw_text,
                ra.id as analysis_id, ra.overall_score, ra.technical_score, ra.experience_score, ra.education_score,
                ra.project_score, ra.formatting_score, ra.readability_score, ra.score_explanations_json,
                ra.extracted_data_json, ra.improvements_json, ra.ai_provider
         FROM resumes r
         LEFT JOIN resume_analyses ra ON ra.resume_id = r.id
         WHERE r.user_id = ?
         ORDER BY r.version_number DESC, r.created_at DESC`
      )
      .all(req.user!.id) as Array<Record<string, unknown>>;

    res.json(
      rows.map((r) => ({
        ...r,
        scoreExplanations: parseJsonSafe(r.score_explanations_json as string, {}),
        extractedData: parseJsonSafe(r.extracted_data_json as string, {}),
        improvements: parseJsonSafe(r.improvements_json as string, {}),
      }))
    );
  });

  router.get('/student/resumes/compare', requireAuth, requireRole('student'), (req: AuthRequest, res) => {
    const aId = Number(req.query.a);
    const bId = Number(req.query.b);
    if (!aId || !bId) return res.status(400).json({ error: 'Select two resume versions to compare.' });

    const fetchOne = (id: number) =>
      db
        .prepare(
          `SELECT r.*, ra.overall_score, ra.technical_score, ra.experience_score, ra.education_score, ra.project_score, ra.formatting_score, ra.readability_score, ra.extracted_data_json
           FROM resumes r LEFT JOIN resume_analyses ra ON ra.resume_id = r.id
           WHERE r.id = ? AND r.user_id = ?`
        )
        .get(id, req.user!.id) as Record<string, unknown> | undefined;

    const resA = fetchOne(aId);
    const resB = fetchOne(bId);
    if (!resA || !resB) return res.status(404).json({ error: 'One or both resume versions were not found.' });

    const dataA = parseJsonSafe<{ technicalSkills?: string[] }>(resA.extracted_data_json as string, {});
    const dataB = parseJsonSafe<{ technicalSkills?: string[] }>(resB.extracted_data_json as string, {});
    const skillsA = new Set((dataA.technicalSkills || []).map((s) => s));
    const skillsB = new Set((dataB.technicalSkills || []).map((s) => s));

    res.json({
      versionA: { ...resA, extractedData: dataA },
      versionB: { ...resB, extractedData: dataB },
      scoreDelta: Number(resB.overall_score || 0) - Number(resA.overall_score || 0),
      addedSkills: Array.from(skillsB).filter((s) => !skillsA.has(s)),
      removedSkills: Array.from(skillsA).filter((s) => !skillsB.has(s)),
      retainedSkills: Array.from(skillsB).filter((s) => skillsA.has(s)),
    });
  });

  router.delete('/student/resumes/:id', requireAuth, requireRole('student'), (req: AuthRequest, res) => {
    const info = db.prepare('DELETE FROM resumes WHERE id = ? AND user_id = ?').run(req.params.id, req.user!.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Resume not found.' });
    logActivity(req.user!.id, 'resume_deleted', 'resume', Number(req.params.id), 'Deleted resume record');
    res.json({ ok: true });
  });

  // --- JOB PORTAL (for students & public authenticated browsing) ---
  router.get('/jobs', optionalAuth, (req: AuthRequest, res) => {
    const { q, location, experience, jobType, skill } = req.query;
    let jobs = db.prepare("SELECT * FROM jobs WHERE status = 'active' ORDER BY created_at DESC").all() as Array<Record<string, unknown>>;

    let studentSkills: string[] = [];
    let studentExp = 0;
    let studentEdu = '';
    const savedSet = new Set<number>();
    const appliedMap = new Map<number, string>();

    if (req.user?.role === 'student') {
      const sp = db.prepare('SELECT * FROM student_profiles WHERE user_id = ?').get(req.user.id) as Record<string, unknown> | undefined;
      studentSkills = parseJsonSafe<string[]>(sp?.skills_json as string, []);
      studentExp = Number(sp?.experience_years || 0);
      studentEdu = `${sp?.degree || ''} ${sp?.university || ''}`;

      const saved = db.prepare('SELECT job_id FROM saved_jobs WHERE user_id = ?').all(req.user.id) as Array<{ job_id: number }>;
      saved.forEach((s) => savedSet.add(s.job_id));

      const apps = db.prepare('SELECT job_id, status FROM applications WHERE student_id = ?').all(req.user.id) as Array<{ job_id: number; status: string }>;
      apps.forEach((a) => appliedMap.set(a.job_id, a.status));
    }

    let formatted = jobs.map((j) => {
      const requiredSkills = parseJsonSafe<string[]>(j.required_skills_json as string, []);
      const preferredSkills = parseJsonSafe<string[]>(j.preferred_skills_json as string, []);
      const softSkills = parseJsonSafe<string[]>(j.soft_skills_json as string, []);
      const responsibilities = parseJsonSafe<string[]>(j.responsibilities_json as string, []);

      const match =
        req.user?.role === 'student'
          ? computeExplainableMatch({
              candidateSkills: studentSkills,
              candidateExperienceYears: studentExp,
              candidateEducationText: studentEdu,
              candidateExperienceHighlights: [],
              candidateProjects: [],
              requiredSkills,
              preferredSkills,
              minYearsExperience: Number(j.min_years_experience || 0),
              educationRequirement: String(j.education_requirement || ''),
            })
          : null;

      return {
        id: j.id,
        title: j.title,
        company: j.company,
        location: j.location,
        job_type: j.job_type,
        experience_level: j.experience_level,
        min_years_experience: j.min_years_experience,
        education_requirement: j.education_requirement,
        salary_range: j.salary_range,
        description: j.description,
        responsibilities,
        requiredSkills,
        preferredSkills,
        softSkills,
        blind_mode: Boolean(j.blind_mode),
        is_demo: Boolean(j.is_demo),
        created_at: j.created_at,
        isSaved: savedSet.has(Number(j.id)),
        applicationStatus: appliedMap.get(Number(j.id)) || null,
        compatibility: match,
      };
    });

    if (q) {
      const ql = String(q).toLowerCase();
      formatted = formatted.filter(
        (j) =>
          String(j.title).toLowerCase().includes(ql) ||
          String(j.company).toLowerCase().includes(ql) ||
          String(j.description).toLowerCase().includes(ql)
      );
    }
    if (location && location !== 'all') {
      const ll = String(location).toLowerCase();
      formatted = formatted.filter((j) => String(j.location).toLowerCase().includes(ll));
    }
    if (experience && experience !== 'all') {
      formatted = formatted.filter((j) => String(j.experience_level).toLowerCase() === String(experience).toLowerCase());
    }
    if (jobType && jobType !== 'all') {
      formatted = formatted.filter((j) => String(j.job_type).toLowerCase() === String(jobType).toLowerCase());
    }
    if (skill) {
      const sl = canonicalizeSkill(String(skill)).toLowerCase();
      formatted = formatted.filter((j) =>
        [...j.requiredSkills, ...j.preferredSkills].some((s) => canonicalizeSkill(s).toLowerCase().includes(sl))
      );
    }

    res.json(formatted);
  });

  router.post('/jobs/:id/save', requireAuth, requireRole('student'), (req: AuthRequest, res) => {
    const jobId = Number(req.params.id);
    const existing = db.prepare('SELECT id FROM saved_jobs WHERE user_id = ? AND job_id = ?').get(req.user!.id, jobId);
    if (existing) {
      db.prepare('DELETE FROM saved_jobs WHERE user_id = ? AND job_id = ?').run(req.user!.id, jobId);
      return res.json({ saved: false });
    }
    db.prepare('INSERT INTO saved_jobs (user_id, job_id) VALUES (?, ?)').run(req.user!.id, jobId);
    res.json({ saved: true });
  });

  router.post('/jobs/:id/apply', requireAuth, requireRole('student'), (req: AuthRequest, res) => {
    const jobId = Number(req.params.id);
    const { resumeId } = req.body || {};
    const job = db.prepare("SELECT * FROM jobs WHERE id = ? AND status = 'active'").get(jobId) as Record<string, unknown> | undefined;
    if (!job) return res.status(404).json({ error: 'Job posting not found or no longer active.' });

    const existing = db.prepare("SELECT id FROM applications WHERE job_id = ? AND student_id = ? AND status != 'withdrawn'").get(jobId, req.user!.id);
    if (existing) return res.status(409).json({ error: 'You have already applied to this position.' });

    let targetResume = resumeId
      ? (db.prepare('SELECT * FROM resumes WHERE id = ? AND user_id = ?').get(Number(resumeId), req.user!.id) as Record<string, unknown> | undefined)
      : (db.prepare('SELECT * FROM resumes WHERE user_id = ? ORDER BY version_number DESC, created_at DESC LIMIT 1').get(req.user!.id) as Record<string, unknown> | undefined);

    if (!targetResume) {
      return res.status(400).json({ error: 'Please upload or analyze at least one resume before applying.' });
    }

    const analysis = db.prepare('SELECT * FROM resume_analyses WHERE resume_id = ? ORDER BY created_at DESC LIMIT 1').get(targetResume.id) as Record<string, unknown> | undefined;
    const sp = db.prepare('SELECT * FROM student_profiles WHERE user_id = ?').get(req.user!.id) as Record<string, unknown> | undefined;

    const extracted = parseJsonSafe<{
      technicalSkills?: string[];
      estimatedYearsExperience?: number;
      education?: Array<{ institution: string; degree: string }>;
      experience?: Array<{ role: string; company: string; highlights: string[] }>;
      projects?: Array<{ name: string; description: string }>;
    }>(analysis?.extracted_data_json as string, {});

    const candidateSkills = Array.from(new Set([...(extracted.technicalSkills || []), ...parseJsonSafe<string[]>(sp?.skills_json as string, [])]));
    const expYears = Math.max(Number(sp?.experience_years || 0), Number(extracted.estimatedYearsExperience || 0));
    const eduText = extracted.education?.map((e) => `${e.degree} ${e.institution}`).join('; ') || `${sp?.degree || ''} ${sp?.university || ''}`;
    const expHighlights = (extracted.experience || []).flatMap((e) => [`${e.role} at ${e.company}`, ...(e.highlights || [])]);
    const projHighlights = (extracted.projects || []).map((p) => `${p.name}: ${p.description}`);

    const match = computeExplainableMatch({
      candidateSkills,
      candidateExperienceYears: expYears,
      candidateEducationText: eduText,
      candidateExperienceHighlights: expHighlights,
      candidateProjects: projHighlights,
      requiredSkills: parseJsonSafe<string[]>(job.required_skills_json as string, []),
      preferredSkills: parseJsonSafe<string[]>(job.preferred_skills_json as string, []),
      minYearsExperience: Number(job.min_years_experience || 0),
      educationRequirement: String(job.education_requirement || ''),
    });

    const anonCode = `CM-${Math.floor(1000 + Math.random() * 9000)}`;
    const insertApp = db
      .prepare(
        `INSERT INTO applications (job_id, student_id, resume_id, status, match_score, skills_match, experience_match, education_match, explainable_json, anonymized_code)
         VALUES (?, ?, ?, 'submitted', ?, ?, ?, ?, ?, ?)`
      )
      .run(
        jobId,
        req.user!.id,
        targetResume.id,
        match.overallMatch,
        match.skillsMatch,
        match.experienceMatch,
        match.educationMatch,
        JSON.stringify(match),
        anonCode
      );

    createNotification(
      Number(job.recruiter_id),
      'New Application Screened',
      `Candidate #${anonCode} applied to ${job.title} (${match.overallMatch}% AI match).`,
      'application',
      'candidates'
    );
    createNotification(
      req.user!.id,
      'Application Submitted',
      `Applied to ${job.title} at ${job.company} with ${match.overallMatch}% compatibility.`,
      'application',
      'applications'
    );
    logActivity(req.user!.id, 'job_applied', 'application', insertApp.lastInsertRowid as number, `Applied to ${job.title}`);

    res.status(201).json({
      id: insertApp.lastInsertRowid,
      anonymizedCode: anonCode,
      match,
    });
  });

  router.get('/student/applications', requireAuth, requireRole('student'), (req: AuthRequest, res) => {
    const rows = db
      .prepare(
        `SELECT a.*, j.title as job_title, j.company, j.location, j.job_type, j.salary_range, r.original_filename
         FROM applications a
         JOIN jobs j ON j.id = a.job_id
         JOIN resumes r ON r.id = a.resume_id
         WHERE a.student_id = ?
         ORDER BY a.updated_at DESC`
      )
      .all(req.user!.id) as Array<Record<string, unknown>>;

    res.json(
      rows.map((row) => ({
        ...row,
        explainable: parseJsonSafe(row.explainable_json as string, {}),
      }))
    );
  });

  router.post('/student/applications/:id/withdraw', requireAuth, requireRole('student'), (req: AuthRequest, res) => {
    const app = db.prepare('SELECT * FROM applications WHERE id = ? AND student_id = ?').get(req.params.id, req.user!.id) as { id: number; status: string } | undefined;
    if (!app) return res.status(404).json({ error: 'Application not found.' });
    if (['offered', 'rejected', 'withdrawn'].includes(app.status)) {
      return res.status(400).json({ error: `Cannot withdraw an application that is already ${app.status}.` });
    }
    db.prepare("UPDATE applications SET status = 'withdrawn', updated_at = datetime('now') WHERE id = ?").run(app.id);
    logActivity(req.user!.id, 'application_withdrawn', 'application', app.id, 'Student withdrew application');
    res.json({ ok: true });
  });

  // --- SKILL GAP ANALYZER ---
  router.post('/student/skill-gap', requireAuth, requireRole('student'), (req: AuthRequest, res) => {
    const { jobId, customSkills } = req.body || {};
    const sp = db.prepare('SELECT * FROM student_profiles WHERE user_id = ?').get(req.user!.id) as Record<string, unknown> | undefined;
    const studentSkills = parseJsonSafe<string[]>(sp?.skills_json as string, []);

    let requiredSkills: string[] = [];
    let preferredSkills: string[] = [];
    let roleTitle = 'Custom Target Role';
    let minExp = 1;
    let eduReq = "Bachelor's Degree";

    if (jobId) {
      const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(Number(jobId)) as Record<string, unknown> | undefined;
      if (!job) return res.status(404).json({ error: 'Selected job not found.' });
      requiredSkills = parseJsonSafe<string[]>(job.required_skills_json as string, []);
      preferredSkills = parseJsonSafe<string[]>(job.preferred_skills_json as string, []);
      roleTitle = `${job.title} — ${job.company}`;
      minExp = Number(job.min_years_experience || 0);
      eduReq = String(job.education_requirement || '');
    } else if (Array.isArray(customSkills) && customSkills.length > 0) {
      requiredSkills = customSkills.map(String);
    } else {
      return res.status(400).json({ error: 'Select a job or enter target skills to analyze.' });
    }

    const match = computeExplainableMatch({
      candidateSkills: studentSkills,
      candidateExperienceYears: Number(sp?.experience_years || 0),
      candidateEducationText: `${sp?.degree || ''} ${sp?.university || ''}`,
      candidateExperienceHighlights: [],
      candidateProjects: [],
      requiredSkills,
      preferredSkills,
      minYearsExperience: minExp,
      educationRequirement: eduReq,
    });

    const priorities = match.missingSkills.map((s, idx) => ({
      skill: s,
      priority: idx === 0 ? 'High' : idx === 1 ? 'Medium' : 'Recommended',
      estimatedStudyHours: 12 + idx * 6,
      rationale: `Explicitly listed as a core requirement for ${roleTitle}.`,
    }));

    res.json({
      roleTitle,
      studentSkills,
      requiredSkills,
      preferredSkills,
      ...match,
      learningPriorities: priorities,
    });
  });

  // --- AI CAREER ROADMAP ---
  router.get('/student/roadmaps', requireAuth, requireRole('student'), (req: AuthRequest, res) => {
    const rows = db.prepare('SELECT * FROM career_roadmaps WHERE user_id = ? ORDER BY updated_at DESC').all(req.user!.id) as Array<Record<string, unknown>>;
    res.json(
      rows.map((r) => ({
        ...r,
        currentSkills: parseJsonSafe<string[]>(r.current_skills_json as string, []),
        requiredSkills: parseJsonSafe<string[]>(r.required_skills_json as string, []),
        missingSkills: parseJsonSafe<string[]>(r.missing_skills_json as string, []),
        milestones: parseJsonSafe<Array<Record<string, unknown>>>(r.milestones_json as string, []),
        projects: parseJsonSafe<Array<Record<string, unknown>>>(r.projects_json as string, []),
      }))
    );
  });

  router.post('/student/roadmaps/generate', requireAuth, requireRole('student'), async (req: AuthRequest, res) => {
    const { targetRole } = req.body || {};
    if (!targetRole || String(targetRole).trim().length < 2) {
      return res.status(400).json({ error: 'Please specify a target career role.' });
    }
    const sp = db.prepare('SELECT skills_json FROM student_profiles WHERE user_id = ?').get(req.user!.id) as { skills_json: string } | undefined;
    const currentSkills = parseJsonSafe<string[]>(sp?.skills_json, []);

    const generated = await generateCareerRoadmapAI(String(targetRole).trim(), currentSkills);
    const completedCount = generated.milestones.filter((m: { completed?: boolean }) => m.completed).length;
    const progress = generated.milestones.length > 0 ? Math.round((completedCount / generated.milestones.length) * 100) : 0;

    const r = db
      .prepare(
        `INSERT INTO career_roadmaps (user_id, target_role, current_skills_json, required_skills_json, missing_skills_json, milestones_json, projects_json, progress_percent, ai_provider)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.user!.id,
        String(targetRole).trim(),
        JSON.stringify(currentSkills),
        JSON.stringify(generated.requiredSkills),
        JSON.stringify(generated.missingSkills),
        JSON.stringify(generated.milestones),
        JSON.stringify(generated.projects),
        progress,
        generated.aiProvider
      );

    logActivity(req.user!.id, 'roadmap_generated', 'roadmap', r.lastInsertRowid as number, `Generated roadmap for ${targetRole}`);
    res.status(201).json({
      id: r.lastInsertRowid,
      target_role: String(targetRole).trim(),
      currentSkills,
      ...generated,
      progress_percent: progress,
    });
  });

  router.patch('/student/roadmaps/:id/milestone', requireAuth, requireRole('student'), (req: AuthRequest, res) => {
    const { milestoneId, completed } = req.body || {};
    const row = db.prepare('SELECT * FROM career_roadmaps WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id) as Record<string, unknown> | undefined;
    if (!row) return res.status(404).json({ error: 'Roadmap not found.' });

    const milestones = parseJsonSafe<Array<{ id: string; completed?: boolean }>>(row.milestones_json as string, []);
    const updated = milestones.map((m) => (m.id === milestoneId ? { ...m, completed: Boolean(completed) } : m));
    const doneCount = updated.filter((m) => m.completed).length;
    const progress = updated.length > 0 ? Math.round((doneCount / updated.length) * 100) : 0;

    db.prepare("UPDATE career_roadmaps SET milestones_json = ?, progress_percent = ?, updated_at = datetime('now') WHERE id = ?").run(
      JSON.stringify(updated),
      progress,
      row.id
    );
    res.json({ ok: true, milestones: updated, progress_percent: progress });
  });

  // --- AI INTERVIEW PREPARATION ---
  router.get('/student/interviews', requireAuth, requireRole('student'), (req: AuthRequest, res) => {
    const sessions = db
      .prepare('SELECT * FROM interview_sessions WHERE user_id = ? ORDER BY created_at DESC')
      .all(req.user!.id) as Array<Record<string, unknown>>;
    const responses = db
      .prepare('SELECT * FROM interview_responses WHERE user_id = ? ORDER BY created_at DESC')
      .all(req.user!.id) as Array<Record<string, unknown>>;

    res.json(
      sessions.map((s) => ({
        ...s,
        questions: parseJsonSafe(s.questions_json as string, []),
        responses: responses
          .filter((r) => r.session_id === s.id)
          .map((r) => ({ ...r, improvementTips: parseJsonSafe(r.improvement_tips_json as string, []) })),
      }))
    );
  });

  router.post('/student/interviews/generate', requireAuth, requireRole('student'), async (req: AuthRequest, res) => {
    const { roleTitle, mode, jobId, customJobDescription } = req.body || {};
    let resolvedTitle = roleTitle ? String(roleTitle).trim() : '';
    let jobContext = customJobDescription ? String(customJobDescription) : '';

    if (jobId) {
      const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(Number(jobId)) as Record<string, unknown> | undefined;
      if (job) {
        resolvedTitle = resolvedTitle || String(job.title);
        jobContext = `${job.title} at ${job.company}: ${job.description}. Required skills: ${job.required_skills_json}`;
      }
    }
    if (!resolvedTitle) resolvedTitle = 'Software Engineer';

    const latestResume = db
      .prepare('SELECT raw_text FROM resumes WHERE user_id = ? ORDER BY version_number DESC, created_at DESC LIMIT 1')
      .get(req.user!.id) as { raw_text: string } | undefined;

    const generated = await generateInterviewQuestionsAI({
      roleTitle: resolvedTitle,
      mode: String(mode || 'technical'),
      resumeContext: latestResume?.raw_text,
      jobContext,
    });

    const r = db
      .prepare('INSERT INTO interview_sessions (user_id, job_id, role_title, mode, questions_json, ai_provider) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.user!.id, jobId || null, resolvedTitle, String(mode || 'technical'), JSON.stringify(generated.questions), generated.aiProvider);

    logActivity(req.user!.id, 'interview_session_started', 'interview', r.lastInsertRowid as number, `Started ${mode} prep for ${resolvedTitle}`);

    res.status(201).json({
      id: r.lastInsertRowid,
      role_title: resolvedTitle,
      mode: mode || 'technical',
      questions: generated.questions,
      responses: [],
      aiProvider: generated.aiProvider,
      fallbackNotice: generated.fallbackNotice,
    });
  });

  router.post('/student/interviews/:id/answer', requireAuth, requireRole('student'), async (req: AuthRequest, res) => {
    const { questionIndex, questionText, userAnswer } = req.body || {};
    if (!userAnswer || String(userAnswer).trim().length < 10) {
      return res.status(400).json({ error: 'Please write at least 10 characters in your answer.' });
    }
    const session = db
      .prepare('SELECT * FROM interview_sessions WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user!.id) as Record<string, unknown> | undefined;
    if (!session) return res.status(404).json({ error: 'Interview session not found.' });

    const evaluation = await evaluateInterviewAnswerAI({
      roleTitle: String(session.role_title),
      questionText: String(questionText),
      userAnswer: String(userAnswer).trim(),
    });

    const insert = db
      .prepare(
        `INSERT INTO interview_responses (session_id, user_id, question_index, question_text, user_answer, ai_score, ai_feedback, improvement_tips_json, ai_provider)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        session.id,
        req.user!.id,
        Number(questionIndex || 0),
        String(questionText),
        String(userAnswer).trim(),
        evaluation.score,
        evaluation.feedback,
        JSON.stringify(evaluation.improvementTips || []),
        evaluation.aiProvider
      );

    res.status(201).json({
      id: insert.lastInsertRowid,
      session_id: session.id,
      question_index: Number(questionIndex || 0),
      question_text: String(questionText),
      user_answer: String(userAnswer).trim(),
      ai_score: evaluation.score,
      ai_feedback: evaluation.feedback,
      improvementTips: evaluation.improvementTips || [],
      aiProvider: evaluation.aiProvider,
      fallbackNotice: evaluation.fallbackNotice,
    });
  });

  // --- RECRUITER PORTAL ROUTES ---
  router.get('/recruiter/dashboard', requireAuth, requireRole('recruiter'), (req: AuthRequest, res) => {
    const recruiterId = req.user!.id;
    const jobs = db.prepare('SELECT * FROM jobs WHERE recruiter_id = ? ORDER BY created_at DESC').all(recruiterId) as Array<Record<string, unknown>>;
    const jobIds = jobs.map((j) => Number(j.id));

    let totalApplications = 0;
    let shortlisted = 0;
    let avgMatchScore = 0;
    let apps: Array<Record<string, unknown>> = [];

    if (jobIds.length > 0) {
      apps = db
        .prepare(
          `SELECT a.*, j.title as job_title FROM applications a
           JOIN jobs j ON j.id = a.job_id
           WHERE j.recruiter_id = ? ORDER BY a.updated_at DESC`
        )
        .all(recruiterId) as Array<Record<string, unknown>>;
      totalApplications = apps.length;
      shortlisted = apps.filter((a) => ['shortlisted', 'interview', 'offered'].includes(String(a.status))).length;
      avgMatchScore = totalApplications > 0 ? Math.round(apps.reduce((sum, a) => sum + Number(a.match_score || 0), 0) / totalApplications) : 0;
    }

    const totalResumesUploaded = (
      db.prepare('SELECT COUNT(*) as c FROM resumes WHERE uploaded_by_user_id = ? OR job_id IN (SELECT id FROM jobs WHERE recruiter_id = ?)').get(recruiterId, recruiterId) as { c: number }
    ).c;

    const statusCounts = ['submitted', 'screening', 'shortlisted', 'interview', 'offered', 'rejected'].map((st) => ({
      stage: st.charAt(0).toUpperCase() + st.slice(1),
      count: apps.filter((a) => a.status === st).length,
    }));

    const scoreBuckets = [
      { range: '90-100%', count: apps.filter((a) => Number(a.match_score) >= 90).length },
      { range: '75-89%', count: apps.filter((a) => Number(a.match_score) >= 75 && Number(a.match_score) < 90).length },
      { range: '60-74%', count: apps.filter((a) => Number(a.match_score) >= 60 && Number(a.match_score) < 75).length },
      { range: '<60%', count: apps.filter((a) => Number(a.match_score) < 60).length },
    ];

    const activities = db.prepare('SELECT * FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 8').all(recruiterId);

    res.json({
      totalJobsPosted: jobs.length,
      activeJobsCount: jobs.filter((j) => j.status === 'active').length,
      totalResumesReceived: Math.max(totalApplications, totalResumesUploaded),
      candidatesAnalyzed: totalApplications,
      shortlistedCandidates: shortlisted,
      avgMatchScore,
      statusCounts,
      scoreBuckets,
      activities,
    });
  });

  router.get('/recruiter/jobs', requireAuth, requireRole('recruiter'), (req: AuthRequest, res) => {
    const jobs = db.prepare('SELECT * FROM jobs WHERE recruiter_id = ? ORDER BY created_at DESC').all(req.user!.id) as Array<Record<string, unknown>>;
    const counts = db
      .prepare('SELECT job_id, COUNT(*) as total, SUM(CASE WHEN status IN (\'shortlisted\', \'interview\', \'offered\') THEN 1 ELSE 0 END) as shortlisted FROM applications GROUP BY job_id')
      .all() as Array<{ job_id: number; total: number; shortlisted: number }>;
    const countMap = new Map(counts.map((c) => [c.job_id, c]));

    res.json(
      jobs.map((j) => ({
        ...j,
        responsibilities: parseJsonSafe<string[]>(j.responsibilities_json as string, []),
        requiredSkills: parseJsonSafe<string[]>(j.required_skills_json as string, []),
        preferredSkills: parseJsonSafe<string[]>(j.preferred_skills_json as string, []),
        softSkills: parseJsonSafe<string[]>(j.soft_skills_json as string, []),
        applicantCount: countMap.get(Number(j.id))?.total || 0,
        shortlistedCount: countMap.get(Number(j.id))?.shortlisted || 0,
      }))
    );
  });

  router.post('/recruiter/jobs/generate-jd', requireAuth, requireRole('recruiter'), async (req: AuthRequest, res) => {
    const { title, company, experienceLevel, location } = req.body || {};
    if (!title) return res.status(400).json({ error: 'Job title is required to generate a job description.' });
    const data = await generateJobDescriptionAI({
      title: String(title),
      company: String(company || 'Hiring Team'),
      experienceLevel: String(experienceLevel || 'Entry Level'),
      location: String(location || 'Remote'),
    });
    res.json(data);
  });

  router.post('/recruiter/jobs', requireAuth, requireRole('recruiter'), (req: AuthRequest, res) => {
    const { title, company, location, jobType, experienceLevel, minYearsExperience, educationRequirement, salaryRange, description, responsibilities, requiredSkills, preferredSkills, softSkills, blindMode } = req.body || {};
    if (!title || !company || !location || !description) {
      return res.status(400).json({ error: 'Title, company, location, and description are required.' });
    }

    const r = db
      .prepare(
        `INSERT INTO jobs (recruiter_id, title, company, location, job_type, experience_level, min_years_experience, education_requirement, salary_range, description, responsibilities_json, required_skills_json, preferred_skills_json, soft_skills_json, status, blind_mode)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`
      )
      .run(
        req.user!.id,
        String(title).trim(),
        String(company).trim(),
        String(location).trim(),
        String(jobType || 'Full-time'),
        String(experienceLevel || 'Entry Level'),
        Number(minYearsExperience || 0),
        String(educationRequirement || "Bachelor's Degree"),
        String(salaryRange || ''),
        String(description).trim(),
        JSON.stringify(Array.isArray(responsibilities) ? responsibilities : []),
        JSON.stringify(Array.isArray(requiredSkills) ? requiredSkills : []),
        JSON.stringify(Array.isArray(preferredSkills) ? preferredSkills : []),
        JSON.stringify(Array.isArray(softSkills) ? softSkills : []),
        blindMode === false ? 0 : 1
      );

    logActivity(req.user!.id, 'job_created', 'job', r.lastInsertRowid as number, `Created job: ${title}`);
    res.status(201).json({ id: r.lastInsertRowid, ok: true });
  });

  router.put('/recruiter/jobs/:id', requireAuth, requireRole('recruiter'), (req: AuthRequest, res) => {
    const { title, company, location, jobType, experienceLevel, minYearsExperience, educationRequirement, salaryRange, description, responsibilities, requiredSkills, preferredSkills, softSkills, blindMode } = req.body || {};
    const info = db
      .prepare(
        `UPDATE jobs SET
          title = COALESCE(?, title),
          company = COALESCE(?, company),
          location = COALESCE(?, location),
          job_type = COALESCE(?, job_type),
          experience_level = COALESCE(?, experience_level),
          min_years_experience = COALESCE(?, min_years_experience),
          education_requirement = COALESCE(?, education_requirement),
          salary_range = COALESCE(?, salary_range),
          description = COALESCE(?, description),
          responsibilities_json = COALESCE(?, responsibilities_json),
          required_skills_json = COALESCE(?, required_skills_json),
          preferred_skills_json = COALESCE(?, preferred_skills_json),
          soft_skills_json = COALESCE(?, soft_skills_json),
          blind_mode = COALESCE(?, blind_mode)
         WHERE id = ? AND recruiter_id = ?`
      )
      .run(
        title ?? null,
        company ?? null,
        location ?? null,
        jobType ?? null,
        experienceLevel ?? null,
        minYearsExperience !== undefined ? Number(minYearsExperience) : null,
        educationRequirement ?? null,
        salaryRange ?? null,
        description ?? null,
        responsibilities ? JSON.stringify(responsibilities) : null,
        requiredSkills ? JSON.stringify(requiredSkills) : null,
        preferredSkills ? JSON.stringify(preferredSkills) : null,
        softSkills ? JSON.stringify(softSkills) : null,
        blindMode !== undefined ? (blindMode ? 1 : 0) : null,
        req.params.id,
        req.user!.id
      );

    if (info.changes === 0) return res.status(404).json({ error: 'Job not found.' });
    res.json({ ok: true });
  });

  router.patch('/recruiter/jobs/:id/toggle', requireAuth, requireRole('recruiter'), (req: AuthRequest, res) => {
    const job = db.prepare('SELECT id, status FROM jobs WHERE id = ? AND recruiter_id = ?').get(req.params.id, req.user!.id) as { id: number; status: string } | undefined;
    if (!job) return res.status(404).json({ error: 'Job not found.' });
    const nextStatus = job.status === 'active' ? 'paused' : 'active';
    db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run(nextStatus, job.id);
    res.json({ ok: true, status: nextStatus });
  });

  router.delete('/recruiter/jobs/:id', requireAuth, requireRole('recruiter'), (req: AuthRequest, res) => {
    const info = db.prepare('DELETE FROM jobs WHERE id = ? AND recruiter_id = ?').run(req.params.id, req.user!.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Job not found.' });
    logActivity(req.user!.id, 'job_deleted', 'job', Number(req.params.id), 'Deleted job posting');
    res.json({ ok: true });
  });

  // Bulk Resume Upload & Automated Screening
  router.post('/recruiter/resumes/bulk-upload', requireAuth, requireRole('recruiter'), upload.array('files', 20), async (req: AuthRequest, res: Response) => {
    const jobId = Number(req.body?.jobId);
    const job = db.prepare('SELECT * FROM jobs WHERE id = ? AND recruiter_id = ?').get(jobId, req.user!.id) as Record<string, unknown> | undefined;
    if (!job) return res.status(404).json({ error: 'Please select one of your active job postings before uploading resumes.' });

    const files = (req.files as Express.Multer.File[]) || [];
    if (files.length === 0) return res.status(400).json({ error: 'Please select at least one PDF, DOCX, or TXT resume file.' });

    const requiredSkills = parseJsonSafe<string[]>(job.required_skills_json as string, []);
    const preferredSkills = parseJsonSafe<string[]>(job.preferred_skills_json as string, []);
    const minExp = Number(job.min_years_experience || 0);
    const eduReq = String(job.education_requirement || '');

    const results: Array<Record<string, unknown>> = [];

    for (const file of files) {
      const validationErr = validateResumeFile(file.originalname, file.mimetype, file.size);
      if (validationErr) {
        results.push({ filename: file.originalname, status: 'error', error: validationErr });
        continue;
      }

      try {
        const parsed = await extractTextFromFile(file.buffer, file.originalname, file.mimetype);
        const dup = db
          .prepare('SELECT id, original_filename FROM resumes WHERE job_id = ? AND content_hash = ? LIMIT 1')
          .get(jobId, parsed.contentHash) as { id: number; original_filename: string } | undefined;

        if (dup) {
          results.push({
            filename: file.originalname,
            status: 'duplicate',
            duplicateOf: dup.original_filename,
            message: `Duplicate content matching already screened file "${dup.original_filename}".`,
          });
          continue;
        }

        // Fair screening: analyze anonymized text first
        const anonymizedForAI = anonymizeResumeText(parsed.rawText);
        const analysis = await analyzeResumeWithAI(anonymizedForAI, String(job.title));

        // Extract contact name/email only for protected storage (masked in blind view)
        const lines = parsed.rawText.split('\n').map((l) => l.trim()).filter(Boolean);
        const emailMatch = parsed.rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        const extractedName = lines[0] && lines[0].length < 55 && !lines[0].includes('@') ? lines[0] : 'Uploaded Candidate';
        const extractedEmail = emailMatch ? emailMatch[0] : '';

        const resInsert = db
          .prepare(
            `INSERT INTO resumes (user_id, uploaded_by_user_id, uploaded_by_role, job_id, original_filename, file_type, file_size, content_hash, raw_text, candidate_name, candidate_email, is_duplicate, version_number)
             VALUES (NULL, ?, 'recruiter', ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`
          )
          .run(req.user!.id, jobId, parsed.originalFilename, parsed.fileType, parsed.fileSize, parsed.contentHash, parsed.rawText, extractedName, extractedEmail);

        const resumeId = resInsert.lastInsertRowid as number;

        db.prepare(
          `INSERT INTO resume_analyses (resume_id, user_id, job_id, overall_score, technical_score, experience_score, education_score, project_score, formatting_score, readability_score, score_explanations_json, extracted_data_json, improvements_json, ai_provider)
           VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          resumeId,
          jobId,
          analysis.overallScore,
          analysis.technicalScore,
          analysis.experienceScore,
          analysis.educationScore,
          analysis.projectScore,
          analysis.formattingScore,
          analysis.readabilityScore,
          JSON.stringify(analysis.scoreExplanations),
          JSON.stringify(analysis.extractedData),
          JSON.stringify(analysis.improvements),
          analysis.aiProvider
        );

        const expText = analysis.extractedData.education.map((e) => `${e.degree} ${e.institution}`).join('; ');
        const expHighlights = analysis.extractedData.experience.flatMap((e) => [`${e.role}`, ...(e.highlights || [])]);
        const projHighlights = analysis.extractedData.projects.map((p) => `${p.name}: ${p.description}`);

        const match = computeExplainableMatch({
          candidateSkills: analysis.extractedData.technicalSkills,
          candidateExperienceYears: analysis.extractedData.estimatedYearsExperience,
          candidateEducationText: expText,
          candidateExperienceHighlights: expHighlights,
          candidateProjects: projHighlights,
          requiredSkills,
          preferredSkills,
          minYearsExperience: minExp,
          educationRequirement: eduReq,
        });

        const anonCode = `CM-${Math.floor(1000 + Math.random() * 9000)}`;
        const appInsert = db
          .prepare(
            `INSERT INTO applications (job_id, student_id, resume_id, status, match_score, skills_match, experience_match, education_match, explainable_json, anonymized_code)
             VALUES (?, NULL, ?, 'screening', ?, ?, ?, ?, ?, ?)`
          )
          .run(jobId, resumeId, match.overallMatch, match.skillsMatch, match.experienceMatch, match.educationMatch, JSON.stringify(match), anonCode);

        results.push({
          filename: file.originalname,
          status: 'screened',
          applicationId: appInsert.lastInsertRowid,
          anonymizedCode: anonCode,
          matchScore: match.overallMatch,
          aiProvider: analysis.aiProvider,
        });
      } catch (err) {
        results.push({
          filename: file.originalname,
          status: 'error',
          error: err instanceof Error ? err.message : 'Failed to parse resume.',
        });
      }
    }

    createNotification(
      req.user!.id,
      'Bulk Screening Complete',
      `Processed ${files.length} resume(s) for ${job.title}.`,
      'screening',
      'candidates'
    );
    logActivity(req.user!.id, 'bulk_resume_screening', 'job', jobId, `Screened ${files.length} resumes for ${job.title}`);

    res.json({ results });
  });

  // Candidate Ranking List (respects Blind Screening)
  router.get('/recruiter/candidates', requireAuth, requireRole('recruiter'), (req: AuthRequest, res) => {
    const { jobId, status, minScore, sortBy, blindMode } = req.query;
    const rows = db
      .prepare(
        `SELECT a.*, j.title as job_title, j.company, j.blind_mode as job_blind_mode, j.required_skills_json,
                r.original_filename, r.candidate_name, r.candidate_email, r.raw_text,
                u.full_name as student_name, u.email as student_email, u.phone as student_phone,
                ra.extracted_data_json, ra.overall_score as resume_quality_score, ra.ai_provider
         FROM applications a
         JOIN jobs j ON j.id = a.job_id
         JOIN resumes r ON r.id = a.resume_id
         LEFT JOIN users u ON u.id = a.student_id
         LEFT JOIN resume_analyses ra ON ra.resume_id = r.id
         WHERE j.recruiter_id = ?
         ORDER BY a.match_score DESC`
      )
      .all(req.user!.id) as Array<Record<string, unknown>>;

    const forceBlind = blindMode === 'true';

    let mapped = rows.map((row) => {
      const explainable = parseJsonSafe<ExplainableMatchResult>(row.explainable_json as string, {} as ExplainableMatchResult);
      const extracted = parseJsonSafe<Record<string, unknown>>(row.extracted_data_json as string, {});
      const manualSkills = parseJsonSafe<string[] | null>(row.manual_skills_json as string, null);
      const isBlind = forceBlind || (Boolean(row.job_blind_mode) && !row.identity_revealed && blindMode !== 'false');

      const realName = String(row.student_name || row.candidate_name || 'Candidate');
      const realEmail = String(row.student_email || row.candidate_email || '');

      return {
        id: row.id,
        job_id: row.job_id,
        job_title: row.job_title,
        company: row.company,
        resume_id: row.resume_id,
        original_filename: isBlind ? `Anonymized_Resume_${row.anonymized_code}.pdf` : row.original_filename,
        anonymized_code: row.anonymized_code,
        isBlind,
        identity_revealed: Boolean(row.identity_revealed),
        displayName: isBlind ? `Candidate #${row.anonymized_code}` : realName,
        contactEmail: isBlind ? 'Hidden during blind screening' : realEmail,
        contactPhone: isBlind ? 'Hidden' : String(row.student_phone || ''),
        status: row.status,
        match_score: row.match_score,
        skills_match: row.skills_match,
        experience_match: row.experience_match,
        education_match: row.education_match,
        resume_quality_score: row.resume_quality_score,
        is_favorite: Boolean(row.is_favorite),
        recruiter_notes: row.recruiter_notes,
        recruiter_feedback: row.recruiter_feedback,
        interview_date: row.interview_date,
        interview_outcome: row.interview_outcome,
        ai_provider: row.ai_provider || 'local-nlp',
        explainable,
        extractedData: {
          ...extracted,
          candidateName: isBlind ? `Candidate #${row.anonymized_code}` : realName,
          email: isBlind ? 'Masked' : realEmail,
          technicalSkills: manualSkills || (extracted.technicalSkills as string[]) || [],
        },
        manualSkillsOverride: manualSkills,
        resumePreviewText: isBlind
          ? anonymizeResumeText(String(row.raw_text || ''), realName, realEmail)
          : String(row.raw_text || ''),
        created_at: row.created_at,
      };
    });

    if (jobId && jobId !== 'all') {
      mapped = mapped.filter((c) => Number(c.job_id) === Number(jobId));
    }
    if (status && status !== 'all') {
      mapped = mapped.filter((c) => c.status === status);
    }
    if (minScore) {
      mapped = mapped.filter((c) => Number(c.match_score) >= Number(minScore));
    }
    if (sortBy === 'skills') {
      mapped.sort((a, b) => Number(b.skills_match) - Number(a.skills_match));
    } else if (sortBy === 'experience') {
      mapped.sort((a, b) => Number(b.experience_match) - Number(a.experience_match));
    } else if (sortBy === 'recent') {
      mapped.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    } else {
      mapped.sort((a, b) => Number(b.match_score) - Number(a.match_score));
    }

    res.json(mapped);
  });

  // Fair Recruitment: Manual corrections to extracted candidate skills + transparent rescoring
  router.patch('/recruiter/candidates/:applicationId/skills', requireAuth, requireRole('recruiter'), (req: AuthRequest, res) => {
    const { skills } = req.body || {};
    if (!Array.isArray(skills)) return res.status(400).json({ error: 'Skills array is required.' });

    const app = db
      .prepare(
        `SELECT a.*, j.required_skills_json, j.preferred_skills_json, j.min_years_experience, j.education_requirement, j.recruiter_id,
                ra.extracted_data_json
         FROM applications a
         JOIN jobs j ON j.id = a.job_id
         LEFT JOIN resume_analyses ra ON ra.resume_id = a.resume_id
         WHERE a.id = ? AND j.recruiter_id = ?`
      )
      .get(req.params.applicationId, req.user!.id) as Record<string, unknown> | undefined;

    if (!app) return res.status(404).json({ error: 'Candidate application not found.' });

    const cleanedSkills = skills.map((s) => String(s).trim()).filter(Boolean);
    const extracted = parseJsonSafe<Record<string, unknown>>(app.extracted_data_json as string, {});
    const eduList = (extracted.education as Array<{ degree: string; institution: string }>) || [];
    const expList = (extracted.experience as Array<{ role: string; highlights: string[] }>) || [];
    const projList = (extracted.projects as Array<{ name: string; description: string }>) || [];

    const match = computeExplainableMatch({
      candidateSkills: cleanedSkills,
      candidateExperienceYears: Number(extracted.estimatedYearsExperience || 1),
      candidateEducationText: eduList.map((e) => `${e.degree} ${e.institution}`).join('; '),
      candidateExperienceHighlights: expList.flatMap((e) => [e.role, ...(e.highlights || [])]),
      candidateProjects: projList.map((p) => `${p.name}: ${p.description}`),
      requiredSkills: parseJsonSafe<string[]>(app.required_skills_json as string, []),
      preferredSkills: parseJsonSafe<string[]>(app.preferred_skills_json as string, []),
      minYearsExperience: Number(app.min_years_experience || 0),
      educationRequirement: String(app.education_requirement || ''),
    });

    db.prepare(
      `UPDATE applications SET manual_skills_json = ?, match_score = ?, skills_match = ?, experience_match = ?, education_match = ?, explainable_json = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(
      JSON.stringify(cleanedSkills),
      match.overallMatch,
      match.skillsMatch,
      match.experienceMatch,
      match.educationMatch,
      JSON.stringify(match),
      app.id
    );

    logActivity(req.user!.id, 'skills_manually_corrected', 'application', Number(app.id), `Corrected skills and recalculated match (${match.overallMatch}%)`);
    res.json({ ok: true, match, skills: cleanedSkills });
  });

  // Recruiter status, shortlist, favorite, notes, feedback, reveal identity
  router.patch('/recruiter/candidates/:applicationId/status', requireAuth, requireRole('recruiter'), (req: AuthRequest, res) => {
    const { status, isFavorite, recruiterNotes, recruiterFeedback, interviewDate, interviewOutcome, revealIdentity } = req.body || {};

    const app = db
      .prepare(
        `SELECT a.*, j.title as job_title, j.company, j.recruiter_id FROM applications a
         JOIN jobs j ON j.id = a.job_id WHERE a.id = ? AND j.recruiter_id = ?`
      )
      .get(req.params.applicationId, req.user!.id) as Record<string, unknown> | undefined;

    if (!app) return res.status(404).json({ error: 'Candidate application not found.' });

    const shouldReveal = revealIdentity === true || ['shortlisted', 'interview', 'offered'].includes(String(status || ''));

    db.prepare(
      `UPDATE applications SET
        status = COALESCE(?, status),
        is_favorite = COALESCE(?, is_favorite),
        recruiter_notes = COALESCE(?, recruiter_notes),
        recruiter_feedback = COALESCE(?, recruiter_feedback),
        interview_date = COALESCE(?, interview_date),
        interview_outcome = COALESCE(?, interview_outcome),
        identity_revealed = CASE WHEN ? = 1 THEN 1 ELSE identity_revealed END,
        updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      status ?? null,
      isFavorite !== undefined ? (isFavorite ? 1 : 0) : null,
      recruiterNotes ?? null,
      recruiterFeedback ?? null,
      interviewDate ?? null,
      interviewOutcome ?? null,
      shouldReveal ? 1 : 0,
      app.id
    );

    if (app.student_id && (status || recruiterFeedback)) {
      createNotification(
        Number(app.student_id),
        status ? `Application Update: ${String(status).toUpperCase()}` : 'Recruiter Feedback Received',
        `${app.company} updated your application for ${app.job_title}${recruiterFeedback ? `: "${recruiterFeedback}"` : '.'}`,
        status === 'interview' ? 'interview' : 'application',
        'applications'
      );
    }

    logActivity(req.user!.id, 'candidate_reviewed', 'application', Number(app.id), `Updated candidate ${app.anonymized_code} (${status || 'notes/feedback'})`);
    res.json({ ok: true });
  });

  // Candidate-specific Interview Question Generator
  router.post('/recruiter/candidates/:applicationId/questions', requireAuth, requireRole('recruiter'), async (req: AuthRequest, res) => {
    const app = db
      .prepare(
        `SELECT a.*, j.title as job_title, j.description, j.required_skills_json, r.raw_text
         FROM applications a
         JOIN jobs j ON j.id = a.job_id
         JOIN resumes r ON r.id = a.resume_id
         WHERE a.id = ? AND j.recruiter_id = ?`
      )
      .get(req.params.applicationId, req.user!.id) as Record<string, unknown> | undefined;

    if (!app) return res.status(404).json({ error: 'Candidate application not found.' });

    const anonymized = anonymizeResumeText(String(app.raw_text || ''));
    const generated = await generateInterviewQuestionsAI({
      roleTitle: String(app.job_title),
      mode: 'Candidate Resume & Job Alignment',
      resumeContext: anonymized,
      jobContext: `${app.description}\nRequired Skills: ${app.required_skills_json}`,
    });

    res.json(generated);
  });

  // Resume download for recruiter (if revealed or non-blind)
  router.get('/recruiter/candidates/:applicationId/resume-download', requireAuth, requireRole('recruiter'), (req: AuthRequest, res) => {
    const app = db
      .prepare(
        `SELECT a.anonymized_code, a.identity_revealed, j.blind_mode, r.original_filename, r.raw_text
         FROM applications a
         JOIN jobs j ON j.id = a.job_id
         JOIN resumes r ON r.id = a.resume_id
         WHERE a.id = ? AND j.recruiter_id = ?`
      )
      .get(req.params.applicationId, req.user!.id) as Record<string, unknown> | undefined;
    if (!app) return res.status(404).json({ error: 'Candidate not found.' });

    const isBlind = Boolean(app.blind_mode) && !app.identity_revealed;
    const text = isBlind ? anonymizeResumeText(String(app.raw_text || '')) : String(app.raw_text || '');
    const outName = isBlind ? `Blind_Resume_${app.anonymized_code}.txt` : `${String(app.original_filename).replace(/\.[^.]+$/, '')}.txt`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${outName}"`);
    res.send(text);
  });

  // Export Recruiter Candidate Ranking Report (CSV)
  router.get('/recruiter/export-report', requireAuth, requireRole('recruiter'), (req: AuthRequest, res) => {
    const rows = db
      .prepare(
        `SELECT a.anonymized_code, a.status, a.match_score, a.skills_match, a.experience_match, a.education_match,
                a.identity_revealed, j.title as job_title, j.blind_mode, u.full_name as student_name, r.candidate_name
         FROM applications a
         JOIN jobs j ON j.id = a.job_id
         JOIN resumes r ON r.id = a.resume_id
         LEFT JOIN users u ON u.id = a.student_id
         WHERE j.recruiter_id = ?
         ORDER BY a.match_score DESC`
      )
      .all(req.user!.id) as Array<Record<string, unknown>>;

    const headers = ['Code', 'Candidate', 'Job Title', 'Status', 'Overall Match %', 'Skills %', 'Experience %', 'Education %'];
    const lines = [headers.join(',')];
    for (const r of rows) {
      const isBlind = Boolean(r.blind_mode) && !r.identity_revealed;
      const name = isBlind ? `Candidate #${r.anonymized_code}` : String(r.student_name || r.candidate_name || 'Candidate');
      lines.push(
        [
          r.anonymized_code,
          `"${name.replace(/"/g, '""')}"`,
          `"${String(r.job_title).replace(/"/g, '""')}"`,
          r.status,
          r.match_score,
          r.skills_match,
          r.experience_match,
          r.education_match,
        ].join(',')
      );
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="CareerMatch_Candidate_Report.csv"');
    res.send(lines.join('\n'));
  });

  // --- ADMIN DASHBOARD ROUTES ---
  router.get('/admin/overview', requireAuth, requireRole('admin'), (_req, res) => {
    const totalStudents = (db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'student'").get() as { c: number }).c;
    const totalRecruiters = (db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'recruiter'").get() as { c: number }).c;
    const activeJobs = (db.prepare("SELECT COUNT(*) as c FROM jobs WHERE status = 'active'").get() as { c: number }).c;
    const totalJobs = (db.prepare('SELECT COUNT(*) as c FROM jobs').get() as { c: number }).c;
    const totalAnalyses = (db.prepare('SELECT COUNT(*) as c FROM resume_analyses').get() as { c: number }).c;
    const totalApplications = (db.prepare('SELECT COUNT(*) as c FROM applications').get() as { c: number }).c;
    const openIssues = (db.prepare("SELECT COUNT(*) as c FROM reported_issues WHERE status = 'open'").get() as { c: number }).c;

    const usageBreakdown = [
      { metric: 'Students', count: totalStudents },
      { metric: 'Recruiters', count: totalRecruiters },
      { metric: 'Active Jobs', count: activeJobs },
      { metric: 'Resume Analyses', count: totalAnalyses },
      { metric: 'Applications', count: totalApplications },
    ];

    res.json({
      totalStudents,
      totalRecruiters,
      activeJobs,
      totalJobs,
      totalAnalyses,
      totalApplications,
      openIssues,
      usageBreakdown,
    });
  });

  router.get('/admin/users', requireAuth, requireRole('admin'), (_req, res) => {
    const users = db
      .prepare('SELECT id, email, role, full_name, company_name, status, email_verified, is_demo, created_at FROM users ORDER BY created_at DESC')
      .all();
    res.json(users);
  });

  router.patch('/admin/users/:id/status', requireAuth, requireRole('admin'), (req: AuthRequest, res) => {
    const { status } = req.body || {};
    if (!['active', 'suspended'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    if (Number(req.params.id) === req.user!.id) return res.status(400).json({ error: 'Cannot suspend your own admin account.' });

    db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, req.params.id);
    logActivity(req.user!.id, 'admin_user_status', 'user', Number(req.params.id), `Changed user status to ${status}`);
    res.json({ ok: true });
  });

  router.get('/admin/jobs', requireAuth, requireRole('admin'), (_req, res) => {
    const jobs = db
      .prepare(
        `SELECT j.*, u.full_name as recruiter_name, u.email as recruiter_email,
                (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id) as applicant_count
         FROM jobs j JOIN users u ON u.id = j.recruiter_id ORDER BY j.created_at DESC`
      )
      .all();
    res.json(jobs);
  });

  router.patch('/admin/jobs/:id/status', requireAuth, requireRole('admin'), (req: AuthRequest, res) => {
    const { status } = req.body || {};
    if (!['active', 'paused', 'closed'].includes(status)) return res.status(400).json({ error: 'Invalid job status.' });
    db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run(status, req.params.id);
    logActivity(req.user!.id, 'admin_job_moderated', 'job', Number(req.params.id), `Set job status to ${status}`);
    res.json({ ok: true });
  });

  router.delete('/admin/jobs/:id', requireAuth, requireRole('admin'), (req: AuthRequest, res) => {
    db.prepare('DELETE FROM jobs WHERE id = ?').run(req.params.id);
    logActivity(req.user!.id, 'admin_job_deleted', 'job', Number(req.params.id), 'Removed job posting');
    res.json({ ok: true });
  });

  router.get('/admin/issues', requireAuth, requireRole('admin'), (_req, res) => {
    const issues = db
      .prepare(
        `SELECT i.*, u.full_name as reporter_name, u.email as reporter_email, u.role as reporter_role
         FROM reported_issues i LEFT JOIN users u ON u.id = i.reporter_id ORDER BY i.created_at DESC`
      )
      .all();
    res.json(issues);
  });

  router.patch('/admin/issues/:id', requireAuth, requireRole('admin'), (req: AuthRequest, res) => {
    const { status, adminNotes } = req.body || {};
    db.prepare('UPDATE reported_issues SET status = COALESCE(?, status), admin_notes = COALESCE(?, admin_notes) WHERE id = ?').run(
      status ?? null,
      adminNotes ?? null,
      req.params.id
    );
    logActivity(req.user!.id, 'admin_issue_updated', 'issue', Number(req.params.id), `Updated issue to ${status || 'noted'}`);
    res.json({ ok: true });
  });

  router.get('/admin/activities', requireAuth, requireRole('admin'), (_req, res) => {
    const logs = db
      .prepare(
        `SELECT l.*, u.full_name as user_name, u.role as user_role
         FROM activity_logs l LEFT JOIN users u ON u.id = l.user_id ORDER BY l.created_at DESC LIMIT 60`
      )
      .all();
    res.json(logs);
  });

  return router;
}
