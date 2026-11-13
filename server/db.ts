import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'careermatch.db');
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('student', 'recruiter', 'admin')),
      full_name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      location TEXT DEFAULT '',
      headline TEXT DEFAULT '',
      company_name TEXT DEFAULT '',
      company_website TEXT DEFAULT '',
      email_verified INTEGER NOT NULL DEFAULT 0,
      verification_token TEXT,
      reset_token TEXT,
      reset_expires TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'suspended')),
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS student_profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      university TEXT DEFAULT '',
      degree TEXT DEFAULT '',
      graduation_year TEXT DEFAULT '',
      bio TEXT DEFAULT '',
      target_role TEXT DEFAULT '',
      skills_json TEXT NOT NULL DEFAULT '[]',
      soft_skills_json TEXT NOT NULL DEFAULT '[]',
      experience_years REAL NOT NULL DEFAULT 0,
      linkedin_url TEXT DEFAULT '',
      portfolio_url TEXT DEFAULT '',
      profile_completion INTEGER NOT NULL DEFAULT 25
    );

    CREATE TABLE IF NOT EXISTS recruiter_profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      company_name TEXT DEFAULT '',
      industry TEXT DEFAULT '',
      company_size TEXT DEFAULT '',
      department TEXT DEFAULT '',
      blind_screening_default INTEGER NOT NULL DEFAULT 1,
      bio TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS resumes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      uploaded_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      uploaded_by_role TEXT NOT NULL DEFAULT 'student',
      job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
      original_filename TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      content_hash TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      candidate_name TEXT DEFAULT '',
      candidate_email TEXT DEFAULT '',
      is_duplicate INTEGER NOT NULL DEFAULT 0,
      duplicate_of_id INTEGER,
      version_number INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS resume_analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resume_id INTEGER NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
      overall_score INTEGER NOT NULL,
      technical_score INTEGER NOT NULL,
      experience_score INTEGER NOT NULL,
      education_score INTEGER NOT NULL,
      project_score INTEGER NOT NULL,
      formatting_score INTEGER NOT NULL,
      readability_score INTEGER NOT NULL,
      score_explanations_json TEXT NOT NULL,
      extracted_data_json TEXT NOT NULL,
      improvements_json TEXT NOT NULL,
      ai_provider TEXT NOT NULL DEFAULT 'local-nlp',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recruiter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      location TEXT NOT NULL,
      job_type TEXT NOT NULL DEFAULT 'Full-time',
      experience_level TEXT NOT NULL DEFAULT 'Entry Level',
      min_years_experience REAL NOT NULL DEFAULT 0,
      education_requirement TEXT NOT NULL DEFAULT 'Bachelor''s Degree',
      salary_range TEXT DEFAULT '',
      description TEXT NOT NULL,
      responsibilities_json TEXT NOT NULL DEFAULT '[]',
      required_skills_json TEXT NOT NULL DEFAULT '[]',
      preferred_skills_json TEXT NOT NULL DEFAULT '[]',
      soft_skills_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'closed')),
      blind_mode INTEGER NOT NULL DEFAULT 1,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS saved_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, job_id)
    );

    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      resume_id INTEGER NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted', 'screening', 'shortlisted', 'interview', 'offered', 'rejected', 'withdrawn')),
      match_score INTEGER NOT NULL DEFAULT 0,
      skills_match INTEGER NOT NULL DEFAULT 0,
      experience_match INTEGER NOT NULL DEFAULT 0,
      education_match INTEGER NOT NULL DEFAULT 0,
      explainable_json TEXT NOT NULL DEFAULT '{}',
      manual_skills_json TEXT,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      identity_revealed INTEGER NOT NULL DEFAULT 0,
      recruiter_notes TEXT DEFAULT '',
      recruiter_feedback TEXT DEFAULT '',
      interview_date TEXT DEFAULT '',
      interview_outcome TEXT DEFAULT '',
      anonymized_code TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS career_roadmaps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_role TEXT NOT NULL,
      current_skills_json TEXT NOT NULL DEFAULT '[]',
      required_skills_json TEXT NOT NULL DEFAULT '[]',
      missing_skills_json TEXT NOT NULL DEFAULT '[]',
      milestones_json TEXT NOT NULL DEFAULT '[]',
      projects_json TEXT NOT NULL DEFAULT '[]',
      progress_percent INTEGER NOT NULL DEFAULT 0,
      ai_provider TEXT NOT NULL DEFAULT 'local-nlp',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS interview_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
      role_title TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'technical',
      questions_json TEXT NOT NULL DEFAULT '[]',
      ai_provider TEXT NOT NULL DEFAULT 'local-nlp',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS interview_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question_index INTEGER NOT NULL,
      question_text TEXT NOT NULL,
      user_answer TEXT NOT NULL,
      ai_score INTEGER NOT NULL DEFAULT 0,
      ai_feedback TEXT NOT NULL,
      improvement_tips_json TEXT NOT NULL DEFAULT '[]',
      ai_provider TEXT NOT NULL DEFAULT 'local-nlp',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'system',
      link_tab TEXT DEFAULT '',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      details TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reported_issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      subject TEXT NOT NULL,
      description TEXT NOT NULL,
      target_type TEXT DEFAULT 'platform',
      target_id INTEGER,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'resolved', 'dismissed')),
      admin_notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT DEFAULT 'Visitor',
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  seedInitialData();
}

function seedInitialData() {
  const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  if (userCount > 0) return;

  const passwordHash = bcrypt.hashSync('Demo1234!', 10);

  const insertUser = db.prepare(`
    INSERT INTO users (email, password_hash, role, full_name, phone, location, headline, company_name, company_website, email_verified, status, is_demo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active', 1)
  `);

  const studentId = insertUser.run(
    'maya.student@careermatch.demo',
    passwordHash,
    'student',
    'Maya Nair',
    '+1 (415) 555-0142',
    'San Francisco, CA',
    'B.S. Computer Science Graduate | Machine Learning & Full-Stack Engineering',
    '',
    ''
  ).lastInsertRowid as number;

  const student2Id = insertUser.run(
    'liam.student@careermatch.demo',
    passwordHash,
    'student',
    'Liam O\'Connor',
    '+1 (206) 555-0188',
    'Seattle, WA',
    'Data Engineering & Cloud Infrastructure Specialist',
    '',
    ''
  ).lastInsertRowid as number;

  const recruiterId = insertUser.run(
    'david.recruiter@careermatch.demo',
    passwordHash,
    'recruiter',
    'David Chen',
    '+1 (650) 555-0193',
    'Palo Alto, CA',
    'Senior Technical Talent Partner',
    'Northstar Systems',
    'https://northstarsystems.example',
  ).lastInsertRowid as number;

  const adminId = insertUser.run(
    'admin@careermatch.demo',
    passwordHash,
    'admin',
    'Priya Kapoor',
    '+1 (415) 555-0100',
    'New York, NY',
    'Platform Operations Administrator',
    'CareerMatch',
    'https://careermatch.example',
  ).lastInsertRowid as number;

  db.prepare(`
    INSERT INTO student_profiles (user_id, university, degree, graduation_year, bio, target_role, skills_json, soft_skills_json, experience_years, linkedin_url, portfolio_url, profile_completion)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    studentId,
    'University of California, Berkeley',
    'B.S. in Computer Science',
    '2026',
    'Final-year CS student focused on applied NLP pipelines, React/TypeScript web applications, and scalable Python backends.',
    'Machine Learning Engineer',
    JSON.stringify(['Python', 'TypeScript', 'React', 'Machine Learning', 'NLP', 'SQL', 'FastAPI', 'Docker']),
    JSON.stringify(['Technical Communication', 'Cross-functional Collaboration', 'Analytical Problem Solving']),
    1.5,
    'https://linkedin.com/in/mayanair-demo',
    'https://github.com/mayanair-demo',
    88
  );

  db.prepare(`
    INSERT INTO student_profiles (user_id, university, degree, graduation_year, bio, target_role, skills_json, soft_skills_json, experience_years, linkedin_url, portfolio_url, profile_completion)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    student2Id,
    'University of Washington',
    'M.S. in Data Science',
    '2026',
    'Graduate student building distributed ETL pipelines, PostgreSQL schemas, and cloud-native microservices.',
    'Data Engineer',
    JSON.stringify(['Python', 'PostgreSQL', 'AWS', 'Docker', 'Kubernetes', 'Apache Spark', 'SQL', 'Git']),
    JSON.stringify(['Stakeholder Alignment', 'Documentation', 'Mentoring']),
    2.0,
    '',
    '',
    76
  );

  db.prepare(`
    INSERT INTO recruiter_profiles (user_id, company_name, industry, company_size, department, blind_screening_default, bio)
    VALUES (?, ?, ?, ?, ?, 1, ?)
  `).run(
    recruiterId,
    'Northstar Systems',
    'Enterprise AI & Cloud Software',
    '250-500 employees',
    'Engineering & Applied AI',
    'Leading structured, skills-first technical recruiting across ML, backend, and full-stack product teams.'
  );

  // Seed Jobs
  const insertJob = db.prepare(`
    INSERT INTO jobs (recruiter_id, title, company, location, job_type, experience_level, min_years_experience, education_requirement, salary_range, description, responsibilities_json, required_skills_json, preferred_skills_json, soft_skills_json, status, blind_mode, is_demo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, 1)
  `);

  const job1Id = insertJob.run(
    recruiterId,
    'Junior Machine Learning Engineer',
    'Northstar Systems',
    'San Francisco, CA (Hybrid)',
    'Full-time',
    'Entry Level',
    1,
    'Bachelor\'s in Computer Science, Data Science, or equivalent',
    '$118,000 - $142,000',
    'Join our Applied Intelligence team to build semantic search, document parsing, and candidate-matching models in production.',
    JSON.stringify([
      'Develop and evaluate NLP text classification and semantic similarity pipelines in Python',
      'Build reliable REST APIs and microservices integrating model inference with PostgreSQL',
      'Collaborate with product engineers to monitor precision, recall, and fairness metrics'
    ]),
    JSON.stringify(['Python', 'Machine Learning', 'NLP', 'SQL', 'REST APIs']),
    JSON.stringify(['FastAPI', 'PyTorch', 'Docker', 'TypeScript']),
    JSON.stringify(['Analytical Thinking', 'Written Communication', 'Team Collaboration'])
  ).lastInsertRowid as number;

  const job2Id = insertJob.run(
    recruiterId,
    'Full-Stack Software Engineer (Early Career)',
    'Northstar Systems',
    'Remote (US)',
    'Full-time',
    'Entry Level',
    1,
    'Bachelor\'s Degree in Computer Science or related technical field',
    '$110,000 - $132,000',
    'Design and ship accessible, high-density SaaS interfaces in React and TypeScript backed by clean relational APIs.',
    JSON.stringify([
      'Build modular React + TypeScript interfaces with responsive layouts and data visualizations',
      'Design normalized SQL schemas and authenticated backend endpoints',
      'Write automated integration tests and participate in structured code reviews'
    ]),
    JSON.stringify(['React', 'TypeScript', 'JavaScript', 'SQL', 'Node.js']),
    JSON.stringify(['Tailwind CSS', 'PostgreSQL', 'Docker', 'CI/CD']),
    JSON.stringify(['Ownership', 'Clear Documentation', 'Adaptability'])
  ).lastInsertRowid as number;

  const job3Id = insertJob.run(
    recruiterId,
    'Data Platform Intern / Co-op',
    'Meridian Cloud Labs',
    'Seattle, WA',
    'Internship',
    'Internship',
    0,
    'Currently enrolled in B.S./M.S. in Computer Science or Data Engineering',
    '$42 - $48 / hr',
    'Work alongside senior data infrastructure engineers to automate ingestion workflows, query optimization, and warehouse observability.',
    JSON.stringify([
      'Author modular Python and SQL data transformation pipelines',
      'Instrument data quality checks across PostgreSQL and cloud object storage',
      'Present sprint metrics and schema proposals to engineering leads'
    ]),
    JSON.stringify(['Python', 'SQL', 'PostgreSQL', 'Git']),
    JSON.stringify(['AWS', 'Docker', 'Apache Spark']),
    JSON.stringify(['Curiosity', 'Structured Problem Solving'])
  ).lastInsertRowid as number;

  const job4Id = insertJob.run(
    recruiterId,
    'AI Product Analyst',
    'Vanguard Analytics',
    'New York, NY (Hybrid)',
    'Full-time',
    'Associate',
    2,
    'Bachelor\'s Degree in Quantitative Field',
    '$98,000 - $120,000',
    'Translate model evaluation data and user behavior funnels into clear product experiments and executive recommendations.',
    JSON.stringify([
      'Analyze matching accuracy, conversion funnels, and fairness audits using SQL and Python',
      'Partner with engineering to define telemetry schemas and A/B test criteria',
      'Create executive dashboards and quarterly capability reviews'
    ]),
    JSON.stringify(['SQL', 'Python', 'Data Analysis', 'Communication']),
    JSON.stringify(['Tableau', 'Machine Learning', 'A/B Testing']),
    JSON.stringify(['Stakeholder Management', 'Executive Storytelling'])
  ).lastInsertRowid as number;

  // Seed sample resumes & analyses
  const mayaResumeText = `MAYA NAIR
San Francisco, CA | maya.student@careermatch.demo | github.com/mayanair-demo

EDUCATION
University of California, Berkeley — B.S. in Computer Science (Expected May 2026), GPA 3.84/4.0

TECHNICAL SKILLS
Languages: Python, TypeScript, JavaScript, SQL
Frameworks & AI: React, FastAPI, Machine Learning, Natural Language Processing (NLP), PyTorch, Tailwind CSS
Infrastructure: PostgreSQL, Docker, Git, REST APIs

EXPERIENCE
Software Engineering Intern, Bayview Health Tech (Summer 2025)
- Built a clinical document parser in Python and FastAPI, cutting manual intake triage time by 38%.
- Developed React + TypeScript reviewer dashboards with PostgreSQL query indexing.

Undergraduate ML Research Assistant, UC Berkeley NLP Group (2024 - 2025)
- Evaluated semantic embedding models for domain-specific skill extraction across 14,000 job descriptions.
- Implemented reproducible evaluation pipelines and precision/recall benchmarking scripts.

PROJECTS
SkillGraph Semantic Matcher — Built a hybrid TF-IDF and neural embedding job matcher with explainable feature weights.
CampusHire Tracker — Full-stack TypeScript application helping 420+ students organize technical interview prep.

CERTIFICATIONS
AWS Certified Cloud Practitioner (2025)
DeepLearning.AI Natural Language Processing Specialization (2024)`;

  const liamResumeText = `LIAM O'CONNOR
Seattle, WA | liam.student@careermatch.demo

EDUCATION
University of Washington — M.S. in Data Science (2026)
B.S. in Informatics (2024)

TECHNICAL SKILLS
Python, PostgreSQL, SQL, AWS, Docker, Kubernetes, Apache Spark, Git, REST APIs

EXPERIENCE
Data Engineering Intern, Cascade Telemetry (2025)
- Designed PostgreSQL partitioning and Spark ETL pipelines processing 1.2M daily telemetry events.
- Containerized data validation workers with Docker and deployed to AWS EKS.

PROJECTS
CloudWarehouse Monitor — Automated schema drift alerting tool in Python and SQL.`;

  const insertResume = db.prepare(`
    INSERT INTO resumes (user_id, uploaded_by_user_id, uploaded_by_role, job_id, original_filename, file_type, file_size, content_hash, raw_text, candidate_name, candidate_email, is_duplicate, version_number)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `);

  const mayaResId = insertResume.run(
    studentId, studentId, 'student', job1Id, 'Maya_Nair_Resume_v2.pdf', 'application/pdf', 148200,
    'demo_hash_maya_v2', mayaResumeText, 'Maya Nair', 'maya.student@careermatch.demo', 2
  ).lastInsertRowid as number;

  const mayaResV1Id = insertResume.run(
    studentId, studentId, 'student', null, 'Maya_Nair_Resume_v1.pdf', 'application/pdf', 124900,
    'demo_hash_maya_v1',
    `MAYA NAIR\nUC Berkeley CS Student\nSkills: Python, JavaScript, SQL, React\nExperience: Software Engineering Intern at Bayview Health Tech. Worked on backend APIs and frontend dashboards.\nProjects: Built a job matcher app.`,
    'Maya Nair', 'maya.student@careermatch.demo', 1
  ).lastInsertRowid as number;

  const liamResId = insertResume.run(
    student2Id, recruiterId, 'recruiter', job1Id, 'Liam_OConnor_CV.pdf', 'application/pdf', 162400,
    'demo_hash_liam_v1', liamResumeText, 'Liam O\'Connor', 'liam.student@careermatch.demo', 1
  ).lastInsertRowid as number;

  const insertAnalysis = db.prepare(`
    INSERT INTO resume_analyses (resume_id, user_id, job_id, overall_score, technical_score, experience_score, education_score, project_score, formatting_score, readability_score, score_explanations_json, extracted_data_json, improvements_json, ai_provider)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'local-nlp')
  `);

  insertAnalysis.run(
    mayaResId, studentId, job1Id,
    89, 92, 85, 94, 90, 88, 86,
    JSON.stringify({
      overall: 'Weighted composite of technical skills (30%), experience impact (25%), project alignment (20%), education (10%), formatting (8%), and readability (7%).',
      technical: 'Strong coverage of Python, ML, NLP, SQL, TypeScript, React, FastAPI, and Docker with verified context.',
      experience: 'Quantified internship outcome (38% intake triage reduction) plus academic NLP research.',
      education: 'Relevant B.S. Computer Science degree with strong 3.84 GPA.',
      project: 'Two high-relevance technical projects directly demonstrating NLP semantic matching and full-stack delivery.',
      formatting: 'Clear chronological sections with consistent headings and concise bullet structure.',
      readability: 'Action-verb lead-ins and measurable outcomes make bullets easy to scan.'
    }),
    JSON.stringify({
      candidateName: 'Maya Nair',
      email: 'maya.student@careermatch.demo',
      summary: 'Final-year UC Berkeley Computer Science student combining applied NLP research with production FastAPI, React, and PostgreSQL internship delivery.',
      technicalSkills: ['Python', 'TypeScript', 'JavaScript', 'SQL', 'React', 'FastAPI', 'Machine Learning', 'NLP', 'PyTorch', 'PostgreSQL', 'Docker', 'Git', 'REST APIs'],
      softSkills: ['Technical Communication', 'Research Collaboration', 'Analytical Problem Solving'],
      education: [{ institution: 'University of California, Berkeley', degree: 'B.S. in Computer Science', year: '2026', details: 'GPA 3.84/4.0' }],
      experience: [
        { role: 'Software Engineering Intern', company: 'Bayview Health Tech', duration: 'Summer 2025', highlights: ['Cut clinical document intake triage time by 38% using Python & FastAPI', 'Built React + TypeScript reviewer dashboards'] },
        { role: 'Undergraduate ML Research Assistant', company: 'UC Berkeley NLP Group', duration: '2024 - 2025', highlights: ['Evaluated semantic embedding models across 14,000 job descriptions'] }
      ],
      projects: [
        { name: 'SkillGraph Semantic Matcher', description: 'Hybrid TF-IDF and neural embedding job matcher with explainable weights' },
        { name: 'CampusHire Tracker', description: 'Full-stack TypeScript interview prep tracker used by 420+ students' }
      ],
      certifications: ['AWS Certified Cloud Practitioner (2025)', 'DeepLearning.AI NLP Specialization (2024)']
    }),
    JSON.stringify({
      grammarSuggestions: [
        'Spell out "NLP" on first mention in the summary before using the abbreviation consistently.',
        'Keep verb tense uniform: use past tense for completed 2024-2025 research milestones.'
      ],
      improvedSummary: 'Final-year UC Berkeley Computer Science candidate (3.84 GPA) specializing in production NLP pipelines, FastAPI microservices, and React/TypeScript applications, with proven internship impact cutting document triage latency by 38%.',
      bulletComparisons: [
        {
          section: 'Experience — Bayview Health Tech',
          original: 'Developed React + TypeScript reviewer dashboards with PostgreSQL query indexing.',
          improved: 'Engineered React and TypeScript reviewer dashboards backed by indexed PostgreSQL queries, accelerating clinical record lookup across multi-thousand document queues.'
        },
        {
          section: 'Projects — SkillGraph Semantic Matcher',
          original: 'Built a hybrid TF-IDF and neural embedding job matcher with explainable feature weights.',
          improved: 'Architected an explainable semantic skill-matching engine combining TF-IDF and dense embeddings, surfacing skill-gap attributions with sub-120ms query latency.'
        }
      ],
      missingInformation: ['Add links to live project demos or deployed benchmarks alongside GitHub', 'Include specific accuracy/F1 metrics for the UC Berkeley NLP benchmark'],
      skillRecommendations: ['Kubernetes', 'CI/CD (GitHub Actions)', 'Unit & Integration Testing (Pytest / Vitest)'],
      checklist: [
        { item: 'Contact & Portfolio Links Included', done: true },
        { item: 'Quantified Impact Metrics in Experience', done: true },
        { item: 'Dedicated Technical Skills Taxonomy', done: true },
        { item: 'Production Testing / CI-CD Evidence', done: false }
      ]
    })
  );

  insertAnalysis.run(
    mayaResV1Id, studentId, null,
    71, 74, 64, 88, 65, 72, 70,
    JSON.stringify({
      overall: 'Earlier baseline resume lacking quantified metrics, project details, and ML/NLP keywords.',
      technical: 'Lists core languages but omits framework and ML depth.',
      experience: 'Describes responsibilities without measurable outcomes.',
      education: 'Strong degree credential, missing graduation date and GPA.',
      project: 'Single brief sentence without stack or impact.',
      formatting: 'Compact plain structure.',
      readability: 'Needs stronger action verbs and metric framing.'
    }),
    JSON.stringify({
      candidateName: 'Maya Nair',
      email: 'maya.student@careermatch.demo',
      summary: 'UC Berkeley Computer Science student with internship experience in backend APIs and frontend dashboards.',
      technicalSkills: ['Python', 'JavaScript', 'SQL', 'React', 'REST APIs'],
      softSkills: ['Teamwork'],
      education: [{ institution: 'UC Berkeley', degree: 'B.S. Computer Science', year: '2026', details: '' }],
      experience: [{ role: 'Software Engineering Intern', company: 'Bayview Health Tech', duration: '2025', highlights: ['Worked on backend APIs and frontend dashboards'] }],
      projects: [{ name: 'Job Matcher App', description: 'Built a job matcher app' }],
      certifications: []
    }),
    JSON.stringify({
      grammarSuggestions: ['Expand bullet points with concrete metrics and technologies used.'],
      improvedSummary: 'Computer Science undergraduate with hands-on full-stack internship experience building React interfaces and Python APIs.',
      bulletComparisons: [{ section: 'Experience', original: 'Worked on backend APIs and frontend dashboards.', improved: 'Built Python REST APIs and React dashboards for internal clinical workflows.' }],
      missingInformation: ['Graduation date', 'Quantified outcomes', 'Project architecture details'],
      skillRecommendations: ['TypeScript', 'PostgreSQL', 'Docker'],
      checklist: [
        { item: 'Contact & Portfolio Links Included', done: false },
        { item: 'Quantified Impact Metrics in Experience', done: false },
        { item: 'Dedicated Technical Skills Taxonomy', done: true },
        { item: 'Production Testing / CI-CD Evidence', done: false }
      ]
    })
  );

  // Seed applications
  const insertApp = db.prepare(`
    INSERT INTO applications (job_id, student_id, resume_id, status, match_score, skills_match, experience_match, education_match, explainable_json, is_favorite, identity_revealed, recruiter_notes, recruiter_feedback, anonymized_code)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertApp.run(
    job1Id, studentId, mayaResId, 'shortlisted', 93, 96, 88, 95,
    JSON.stringify({
      matchedSkills: ['Python', 'Machine Learning', 'NLP', 'SQL', 'REST APIs', 'FastAPI', 'PyTorch', 'Docker', 'TypeScript'],
      semanticMatches: [{ required: 'NLP', matched: 'Natural Language Processing (NLP)', similarity: 100 }],
      partiallyMatchedSkills: [],
      missingSkills: [],
      relevantExperience: ['Software Engineering Intern at Bayview Health Tech (38% triage latency reduction)', 'Undergraduate ML Research Assistant at UC Berkeley NLP Group'],
      relevantProjects: ['SkillGraph Semantic Matcher — directly aligns with Northstar Systems semantic matching stack'],
      matchingQualifications: ['B.S. in Computer Science (UC Berkeley, 3.84 GPA) meets Bachelor\'s requirement'],
      breakdown: { skillsWeight: 55, experienceWeight: 25, educationWeight: 20, skillsScore: 96, experienceScore: 88, educationScore: 95 },
      explanation: 'Strong alignment across all 5 required skills and 4 preferred skills. Quantified Python/FastAPI internship and academic NLP embedding research directly mirror role responsibilities.'
    }),
    1, 1,
    'Strongest NLP research + production FastAPI blend in this cohort. Ready for technical panel.',
    'Shortlisted for Technical Panel — your SkillGraph Semantic Matcher project and FastAPI internship aligned closely with our Applied Intelligence stack.',
    'CM-4821'
  );

  insertApp.run(
    job1Id, student2Id, liamResId, 'screening', 74, 68, 86, 92,
    JSON.stringify({
      matchedSkills: ['Python', 'SQL', 'REST APIs', 'Docker'],
      semanticMatches: [{ required: 'SQL', matched: 'PostgreSQL', similarity: 90 }],
      partiallyMatchedSkills: ['Data Engineering Pipelines (adjacent to ML deployment)'],
      missingSkills: ['Machine Learning', 'NLP', 'PyTorch'],
      relevantExperience: ['Data Engineering Intern at Cascade Telemetry (1.2M daily events)'],
      relevantProjects: ['CloudWarehouse Monitor'],
      matchingQualifications: ['M.S. in Data Science (University of Washington) exceeds minimum degree requirement'],
      breakdown: { skillsWeight: 55, experienceWeight: 25, educationWeight: 20, skillsScore: 68, experienceScore: 86, educationScore: 92 },
      explanation: 'Strong data infrastructure and SQL/Python foundation, but lacks demonstrated Machine Learning and NLP coursework or project experience required for this ML Engineer opening.'
    }),
    0, 0,
    'Consider redirecting to Data Platform Intern / Infrastructure role.',
    '',
    'CM-7394'
  );

  insertApp.run(
    job2Id, studentId, mayaResId, 'interview', 91, 92, 85, 95,
    JSON.stringify({
      matchedSkills: ['React', 'TypeScript', 'JavaScript', 'SQL', 'Tailwind CSS', 'PostgreSQL', 'Docker'],
      semanticMatches: [{ required: 'Node.js', matched: 'FastAPI / REST APIs (Backend API equivalence)', similarity: 70 }],
      partiallyMatchedSkills: ['Node.js (backend experience in Python/FastAPI)'],
      missingSkills: ['CI/CD'],
      relevantExperience: ['Software Engineering Intern at Bayview Health Tech (React + TypeScript dashboards)'],
      relevantProjects: ['CampusHire Tracker (TypeScript full-stack)'],
      matchingQualifications: ['B.S. in Computer Science (UC Berkeley)'],
      breakdown: { skillsWeight: 55, experienceWeight: 25, educationWeight: 20, skillsScore: 92, experienceScore: 85, educationScore: 95 },
      explanation: 'High frontend and relational database proficiency in React, TypeScript, and PostgreSQL. Backend experience is Python/FastAPI rather than Node.js, representing a minor ramp-up.'
    }),
    1, 1,
    'Interview scheduled for next Tuesday 2:00 PM PT.',
    'Invited to 45-minute Frontend & API Architecture Interview.',
    'CM-5190'
  );

  // Seed Career Roadmap for Maya
  db.prepare(`
    INSERT INTO career_roadmaps (user_id, target_role, current_skills_json, required_skills_json, missing_skills_json, milestones_json, projects_json, progress_percent, ai_provider)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'local-nlp')
  `).run(
    studentId,
    'Machine Learning Engineer',
    JSON.stringify(['Python', 'Machine Learning', 'NLP', 'PyTorch', 'SQL', 'FastAPI', 'Docker']),
    JSON.stringify(['Python', 'Machine Learning', 'NLP', 'PyTorch', 'MLOps / Model Serving', 'Kubernetes', 'CI/CD', 'Distributed Evaluation']),
    JSON.stringify(['MLOps / Model Serving', 'Kubernetes', 'CI/CD']),
    JSON.stringify([
      { id: 'm1', order: 1, title: 'Production NLP & Embedding Benchmarks', duration: '2 weeks', skills: ['NLP', 'PyTorch'], description: 'Establish reproducible F1, latency, and calibration benchmarks for text models.', completed: true },
      { id: 'm2', order: 2, title: 'Containerized FastAPI Model Serving', duration: '2 weeks', skills: ['FastAPI', 'Docker'], description: 'Package inference endpoints with batching, health checks, and structured logging.', completed: true },
      { id: 'm3', order: 3, title: 'Automated ML CI/CD & Regression Gates', duration: '3 weeks', skills: ['CI/CD', 'MLOps / Model Serving'], description: 'Configure GitHub Actions pipelines to run model quality gates before container release.', completed: false },
      { id: 'm4', order: 4, title: 'Kubernetes Autoscaling & Drift Monitoring', duration: '3 weeks', skills: ['Kubernetes'], description: 'Deploy inference pods with resource limits and input distribution drift alerts.', completed: false }
    ]),
    JSON.stringify([
      { title: 'Zero-Downtime Semantic Search Service', outcome: 'Containerized FastAPI + FAISS/SQLite service with automated GitHub Actions evaluation suite.' },
      { title: 'Fairness & Bias Audit Notebook', outcome: 'Automated counterfactual testing script verifying blind screening consistency across demographic proxies.' }
    ]),
    50
  );

  // Seed Interview Session for Maya
  const sessionId = db.prepare(`
    INSERT INTO interview_sessions (user_id, job_id, role_title, mode, questions_json, ai_provider)
    VALUES (?, ?, ?, 'technical', ?, 'local-nlp')
  `).run(
    studentId,
    job1Id,
    'Junior Machine Learning Engineer',
    JSON.stringify([
      { index: 0, type: 'Technical', question: 'How would you combine lexical matching (like TF-IDF) with semantic embeddings to match resumes against job descriptions without hiding why a score was assigned?' },
      { index: 1, type: 'Resume-Based', question: 'In your Bayview Health Tech internship, how did you measure the 38% reduction in document triage time and handle edge-case PDF formatting?' },
      { index: 2, type: 'HR / Fairness', question: 'What safeguards should an engineering team put in place when deploying AI screening tools in recruitment?' }
    ])
  ).lastInsertRowid as number;

  db.prepare(`
    INSERT INTO interview_responses (session_id, user_id, question_index, question_text, user_answer, ai_score, ai_feedback, improvement_tips_json, ai_provider)
    VALUES (?, ?, 0, ?, ?, 86, ?, ?, 'local-nlp')
  `).run(
    sessionId,
    studentId,
    'How would you combine lexical matching (like TF-IDF) with semantic embeddings to match resumes against job descriptions without hiding why a score was assigned?',
    'I normalize canonical skill synonyms first, compute weighted exact and semantic skill overlap, and then use embedding similarity as a bounded tie-breaker so recruiters can inspect each matched and missing skill directly.',
    'Clear, structured explanation that balances retrieval precision with recruiter explainability. Mentioning canonical normalization and bounded weights shows practical engineering judgment.',
    JSON.stringify(['Mention how you handle false positives in cosine similarity thresholds', 'Cite latency targets or caching strategies for embedding inference'])
  );

  // Seed Notifications
  const insertNotif = db.prepare(`
    INSERT INTO notifications (user_id, title, message, category, link_tab, is_read)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertNotif.run(studentId, 'Shortlisted for Junior Machine Learning Engineer', 'Northstar Systems shortlisted your application (93% match).', 'application', 'applications', 0);
  insertNotif.run(studentId, 'Interview Invitation Received', 'Northstar Systems invited you to a Frontend & API Architecture Interview.', 'interview', 'applications', 0);
  insertNotif.run(studentId, 'Resume Analysis Complete', 'Maya_Nair_Resume_v2.pdf scored 89/100 across 6 evaluation dimensions.', 'resume', 'analyzer', 1);

  insertNotif.run(recruiterId, 'Screening Completed: 2 Candidates Ranked', 'AI screening completed for Junior Machine Learning Engineer with explainable breakdowns.', 'screening', 'candidates', 0);
  insertNotif.run(recruiterId, 'New Candidate Application', 'Candidate #CM-4821 applied to Full-Stack Software Engineer (91% match).', 'application', 'candidates', 0);

  insertNotif.run(adminId, 'Demonstration Environment Initialized', 'Sample student, recruiter, job, and screening records are active for verification.', 'system', 'overview', 0);

  // Seed Activity Logs & Reported Issue
  const insertActivity = db.prepare(`
    INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertActivity.run(studentId, 'resume_analyzed', 'resume', mayaResId, 'Analyzed Maya_Nair_Resume_v2.pdf (Score: 89/100)');
  insertActivity.run(recruiterId, 'job_published', 'job', job1Id, 'Published Junior Machine Learning Engineer at Northstar Systems');
  insertActivity.run(recruiterId, 'candidate_shortlisted', 'application', 1, 'Shortlisted Candidate CM-4821 after blind screening review');

  db.prepare(`
    INSERT INTO reported_issues (reporter_id, subject, description, target_type, target_id, status, admin_notes)
    VALUES (?, ?, ?, 'job', ?, 'open', '')
  `).run(
    studentId,
    'Salary range formatting check on Data Platform listing',
    'Hourly rate is listed clearly, confirming whether relocation stipend applies for Seattle summer co-op.',
    job3Id
  );
}
