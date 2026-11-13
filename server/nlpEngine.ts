import { GoogleGenAI, Type } from '@google/genai';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Canonical Skill Ontology & Semantic Synonym Map (NLP normalization)
const SKILL_SYNONYMS: Record<string, string[]> = {
  'Machine Learning': ['ml', 'machine learning', 'statistical learning', 'predictive modeling', 'supervised learning', 'unsupervised learning', 'scikit-learn', 'sklearn'],
  'Natural Language Processing': ['nlp', 'natural language processing', 'text mining', 'spacy', 'transformers', 'llm', 'bert', 'text classification', 'semantic search'],
  'Artificial Intelligence': ['ai', 'artificial intelligence', 'generative ai', 'genai', 'applied ai'],
  'JavaScript': ['js', 'javascript', 'es6', 'ecmascript', 'vanilla js'],
  'TypeScript': ['ts', 'typescript'],
  'Python': ['python', 'python3', 'py'],
  'React': ['react', 'reactjs', 'react.js', 'next.js', 'nextjs'],
  'Node.js': ['node', 'nodejs', 'node.js', 'express', 'expressjs'],
  'FastAPI': ['fastapi', 'fast api'],
  'SQL': ['sql', 't-sql', 'pl/sql', 'structured query language'],
  'PostgreSQL': ['postgres', 'postgresql', 'psql'],
  'MySQL': ['mysql', 'mariadb'],
  'MongoDB': ['mongodb', 'mongo', 'nosql'],
  'Docker': ['docker', 'containerization', 'containers'],
  'Kubernetes': ['k8s', 'kubernetes', 'eks', 'gke'],
  'AWS': ['aws', 'amazon web services', 'ec2', 's3', 'lambda'],
  'Google Cloud': ['gcp', 'google cloud', 'google cloud platform'],
  'Azure': ['azure', 'microsoft azure'],
  'CI/CD': ['ci/cd', 'cicd', 'github actions', 'jenkins', 'gitlab ci', 'devops'],
  'REST APIs': ['rest', 'rest api', 'rest apis', 'restful', 'restful apis'],
  'PyTorch': ['pytorch', 'torch', 'deep learning'],
  'TensorFlow': ['tensorflow', 'tf', 'keras'],
  'Tailwind CSS': ['tailwind', 'tailwindcss', 'tailwind css'],
  'Git': ['git', 'github', 'gitlab', 'version control'],
  'Data Analysis': ['data analysis', 'data analytics', 'pandas', 'numpy', 'exploratory data analysis', 'eda'],
  'Apache Spark': ['spark', 'apache spark', 'pyspark'],
  'Java': ['java', 'spring', 'spring boot'],
  'C++': ['c++', 'cpp'],
  'Go': ['golang', 'go language'],
  'GraphQL': ['graphql'],
  'Figma': ['figma', 'ui/ux', 'wireframing', 'prototyping'],
  'Unit Testing': ['jest', 'vitest', 'pytest', 'unit testing', 'automated testing'],
};

const SOFT_SKILL_KEYWORDS = [
  'Communication',
  'Leadership',
  'Team Collaboration',
  'Problem Solving',
  'Analytical Thinking',
  'Project Management',
  'Mentoring',
  'Time Management',
  'Adaptability',
  'Documentation',
  'Stakeholder Management',
  'Agile',
  'Scrum',
  'Presentation',
];

export function canonicalizeSkill(skill: string): string {
  const lower = skill.trim().toLowerCase();
  for (const [canonical, synonyms] of Object.entries(SKILL_SYNONYMS)) {
    if (canonical.toLowerCase() === lower || synonyms.includes(lower)) {
      return canonical;
    }
  }
  return skill.trim();
}

export function extractSkillsHeuristic(text: string): { technicalSkills: string[]; softSkills: string[] } {
  const lower = text.toLowerCase();
  const technicalFound = new Set<string>();

  for (const [canonical, synonyms] of Object.entries(SKILL_SYNONYMS)) {
    for (const syn of synonyms) {
      const escaped = syn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(^|[^a-z0-9+#.])${escaped}([^a-z0-9+#.]|$)`, 'i');
      if (regex.test(lower)) {
        technicalFound.add(canonical);
        break;
      }
    }
  }

  const softFound = new Set<string>();
  for (const soft of SOFT_SKILL_KEYWORDS) {
    if (lower.includes(soft.toLowerCase())) {
      softFound.add(soft);
    }
  }

  return {
    technicalSkills: Array.from(technicalFound),
    softSkills: Array.from(softFound),
  };
}

// Strip PII / demographic signals for fair blind screening before AI/scoring
export function anonymizeResumeText(rawText: string, candidateName?: string, candidateEmail?: string): string {
  let sanitized = rawText;
  if (candidateName && candidateName.trim().length > 2) {
    const parts = candidateName.trim().split(/\s+/);
    for (const part of parts) {
      if (part.length > 2) {
        const rx = new RegExp(part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        sanitized = sanitized.replace(rx, '[CANDIDATE]');
      }
    }
  }
  if (candidateEmail) {
    sanitized = sanitized.replace(new RegExp(candidateEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[EMAIL_REDACTED]');
  }
  sanitized = sanitized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]');
  sanitized = sanitized.replace(/(\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, '[PHONE_REDACTED]');
  return sanitized;
}

export interface ExplainableMatchResult {
  overallMatch: number;
  skillsMatch: number;
  experienceMatch: number;
  educationMatch: number;
  matchedSkills: string[];
  semanticMatches: Array<{ required: string; matched: string; similarity: number }>;
  partiallyMatchedSkills: string[];
  missingSkills: string[];
  relevantExperience: string[];
  relevantProjects: string[];
  matchingQualifications: string[];
  breakdown: {
    skillsWeight: number;
    experienceWeight: number;
    educationWeight: number;
    skillsScore: number;
    experienceScore: number;
    educationScore: number;
  };
  explanation: string;
}

export function computeExplainableMatch(params: {
  candidateSkills: string[];
  candidateExperienceYears: number;
  candidateEducationText: string;
  candidateExperienceHighlights: string[];
  candidateProjects: string[];
  requiredSkills: string[];
  preferredSkills: string[];
  minYearsExperience: number;
  educationRequirement: string;
}): ExplainableMatchResult {
  const candCanon = new Map<string, string>();
  for (const s of params.candidateSkills) {
    const c = canonicalizeSkill(s);
    candCanon.set(c.toLowerCase(), s);
  }

  const matchedSkills: string[] = [];
  const semanticMatches: Array<{ required: string; matched: string; similarity: number }> = [];
  const partiallyMatchedSkills: string[] = [];
  const missingSkills: string[] = [];

  const reqs = params.requiredSkills.length > 0 ? params.requiredSkills : [];
  let skillPoints = 0;

  for (const req of reqs) {
    const reqCanon = canonicalizeSkill(req);
    const exactKey = req.trim().toLowerCase();
    const canonKey = reqCanon.toLowerCase();

    if (candCanon.has(canonKey)) {
      const originalCand = candCanon.get(canonKey)!;
      matchedSkills.push(req);
      if (originalCand.toLowerCase() !== exactKey) {
        semanticMatches.push({ required: req, matched: originalCand, similarity: 95 });
      }
      skillPoints += 1;
    } else if (
      (canonKey.includes('sql') && Array.from(candCanon.keys()).some((k) => k.includes('sql') || k.includes('postgres'))) ||
      (canonKey.includes('node') && candCanon.has('fastapi')) ||
      (canonKey.includes('cloud') && (candCanon.has('aws') || candCanon.has('google cloud') || candCanon.has('azure')))
    ) {
      partiallyMatchedSkills.push(`${req} (adjacent stack experience)`);
      skillPoints += 0.6;
    } else {
      missingSkills.push(req);
    }
  }

  // Preferred skills bonus (up to +12% within skill score cap of 100)
  let preferredBonus = 0;
  for (const pref of params.preferredSkills) {
    const prefCanon = canonicalizeSkill(pref).toLowerCase();
    if (candCanon.has(prefCanon)) {
      if (!matchedSkills.includes(pref)) matchedSkills.push(pref);
      preferredBonus += 4;
    }
  }

  const baseSkillScore = reqs.length > 0 ? Math.round((skillPoints / reqs.length) * 92) : 78;
  const skillsMatch = Math.min(100, Math.max(15, baseSkillScore + Math.min(12, preferredBonus)));

  // Experience match
  const minYrs = Math.max(0, params.minYearsExperience || 0);
  let experienceMatch = 85;
  if (minYrs === 0) {
    experienceMatch = params.candidateExperienceYears >= 0.5 ? 95 : 84;
  } else {
    const ratio = params.candidateExperienceYears / minYrs;
    if (ratio >= 1.2) experienceMatch = 96;
    else if (ratio >= 1) experienceMatch = 90;
    else if (ratio >= 0.7) experienceMatch = 78;
    else if (ratio >= 0.4) experienceMatch = 64;
    else experienceMatch = 48;
  }

  // Education match
  const eduLower = (params.candidateEducationText || '').toLowerCase();
  const reqEduLower = (params.educationRequirement || '').toLowerCase();
  let educationMatch = 76;
  if (eduLower.includes('ph.d') || eduLower.includes('phd') || eduLower.includes('master') || eduLower.includes('m.s')) {
    educationMatch = 96;
  } else if (eduLower.includes('bachelor') || eduLower.includes('b.s') || eduLower.includes('b.tech') || eduLower.includes('b.e') || eduLower.includes('computer science')) {
    educationMatch = reqEduLower.includes('master') ? 82 : 92;
  } else if (eduLower.length > 10) {
    educationMatch = 74;
  }

  const skillsWeight = 55;
  const experienceWeight = 25;
  const educationWeight = 20;
  const overallMatch = Math.round(
    (skillsMatch * skillsWeight + experienceMatch * experienceWeight + educationMatch * educationWeight) / 100
  );

  const matchingQualifications: string[] = [];
  if (params.candidateEducationText) matchingQualifications.push(params.candidateEducationText);
  if (params.candidateExperienceYears > 0) {
    matchingQualifications.push(`${params.candidateExperienceYears} yrs relevant experience (requirement: ${minYrs} yrs)`);
  }

  const explanationParts: string[] = [];
  explanationParts.push(
    `Matched ${matchedSkills.length} technical/preferred skills (${skillsMatch}% skills score)`
  );
  if (semanticMatches.length > 0) {
    explanationParts.push(
      `including semantic synonym equivalences (${semanticMatches.map((m) => `${m.matched} ≈ ${m.required}`).join(', ')})`
    );
  }
  if (missingSkills.length > 0) {
    explanationParts.push(`Gap areas: ${missingSkills.join(', ')}`);
  } else {
    explanationParts.push('Meets all core required technical skills');
  }

  return {
    overallMatch,
    skillsMatch,
    experienceMatch,
    educationMatch,
    matchedSkills,
    semanticMatches,
    partiallyMatchedSkills,
    missingSkills,
    relevantExperience: params.candidateExperienceHighlights.slice(0, 3),
    relevantProjects: params.candidateProjects.slice(0, 3),
    matchingQualifications,
    breakdown: {
      skillsWeight,
      experienceWeight,
      educationWeight,
      skillsScore: skillsMatch,
      experienceScore: experienceMatch,
      educationScore: educationMatch,
    },
    explanation: explanationParts.join('. ') + '.',
  };
}

export interface ResumeAnalysisOutput {
  overallScore: number;
  technicalScore: number;
  experienceScore: number;
  educationScore: number;
  projectScore: number;
  formattingScore: number;
  readabilityScore: number;
  scoreExplanations: {
    overall: string;
    technical: string;
    experience: string;
    education: string;
    project: string;
    formatting: string;
    readability: string;
  };
  extractedData: {
    candidateName: string;
    email: string;
    summary: string;
    technicalSkills: string[];
    softSkills: string[];
    estimatedYearsExperience: number;
    education: Array<{ institution: string; degree: string; year: string; details: string }>;
    experience: Array<{ role: string; company: string; duration: string; highlights: string[] }>;
    projects: Array<{ name: string; description: string }>;
    certifications: string[];
  };
  improvements: {
    grammarSuggestions: string[];
    improvedSummary: string;
    bulletComparisons: Array<{ section: string; original: string; improved: string }>;
    missingInformation: string[];
    skillRecommendations: string[];
    checklist: Array<{ item: string; done: boolean }>;
  };
  aiProvider: 'gemini' | 'local-nlp';
  fallbackNotice?: string;
}

export async function analyzeResumeWithAI(rawText: string, targetRole?: string): Promise<ResumeAnalysisOutput> {
  const ai = getGeminiClient();
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Analyze the following resume text thoroughly${targetRole ? ` for the target role of "${targetRole}"` : ''}.
Return structured JSON with accurate extracted information, honest rubric-based scores (0-100), clear explanations of how each score was calculated, and concrete grammar, summary, and bullet-level improvements comparing original vs improved text.
Do not invent skills or experience not present in the resume text.

RESUME TEXT:
${rawText.slice(0, 14000)}`,
        config: {
          systemInstruction:
            'You are an objective, fair recruitment and career-coaching analyst. Extract structured facts accurately, evaluate skills using semantic equivalence (e.g. ML=Machine Learning, JS=JavaScript, NLP=Natural Language Processing), and explain every score transparently.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              overallScore: { type: Type.INTEGER },
              technicalScore: { type: Type.INTEGER },
              experienceScore: { type: Type.INTEGER },
              educationScore: { type: Type.INTEGER },
              projectScore: { type: Type.INTEGER },
              formattingScore: { type: Type.INTEGER },
              readabilityScore: { type: Type.INTEGER },
              scoreExplanations: {
                type: Type.OBJECT,
                properties: {
                  overall: { type: Type.STRING },
                  technical: { type: Type.STRING },
                  experience: { type: Type.STRING },
                  education: { type: Type.STRING },
                  project: { type: Type.STRING },
                  formatting: { type: Type.STRING },
                  readability: { type: Type.STRING },
                },
                required: ['overall', 'technical', 'experience', 'education', 'project', 'formatting', 'readability'],
              },
              extractedData: {
                type: Type.OBJECT,
                properties: {
                  candidateName: { type: Type.STRING },
                  email: { type: Type.STRING },
                  summary: { type: Type.STRING },
                  technicalSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
                  softSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
                  estimatedYearsExperience: { type: Type.NUMBER },
                  education: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        institution: { type: Type.STRING },
                        degree: { type: Type.STRING },
                        year: { type: Type.STRING },
                        details: { type: Type.STRING },
                      },
                    },
                  },
                  experience: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        role: { type: Type.STRING },
                        company: { type: Type.STRING },
                        duration: { type: Type.STRING },
                        highlights: { type: Type.ARRAY, items: { type: Type.STRING } },
                      },
                    },
                  },
                  projects: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        name: { type: Type.STRING },
                        description: { type: Type.STRING },
                      },
                    },
                  },
                  certifications: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ['candidateName', 'email', 'summary', 'technicalSkills', 'softSkills', 'estimatedYearsExperience', 'education', 'experience', 'projects', 'certifications'],
              },
              improvements: {
                type: Type.OBJECT,
                properties: {
                  grammarSuggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
                  improvedSummary: { type: Type.STRING },
                  bulletComparisons: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        section: { type: Type.STRING },
                        original: { type: Type.STRING },
                        improved: { type: Type.STRING },
                      },
                    },
                  },
                  missingInformation: { type: Type.ARRAY, items: { type: Type.STRING } },
                  skillRecommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
                  checklist: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        item: { type: Type.STRING },
                        done: { type: Type.BOOLEAN },
                      },
                    },
                  },
                },
                required: ['grammarSuggestions', 'improvedSummary', 'bulletComparisons', 'missingInformation', 'skillRecommendations', 'checklist'],
              },
            },
            required: ['overallScore', 'technicalScore', 'experienceScore', 'educationScore', 'projectScore', 'formattingScore', 'readabilityScore', 'scoreExplanations', 'extractedData', 'improvements'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      return {
        ...parsed,
        aiProvider: 'gemini',
      };
    } catch (err) {
      console.warn('Gemini resume analysis failed, falling back to local NLP engine:', err);
    }
  }

  return localAnalyzeResume(rawText, targetRole);
}

function localAnalyzeResume(rawText: string, targetRole?: string): ResumeAnalysisOutput {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
  const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const candidateEmail = emailMatch ? emailMatch[0] : '';
  const candidateName = lines[0] && lines[0].length < 55 && !lines[0].includes('@') ? lines[0] : 'Candidate';

  const { technicalSkills, softSkills } = extractSkillsHeuristic(rawText);
  const lower = rawText.toLowerCase();

  // Detect sections & bullets
  const bullets = lines.filter((l) => l.startsWith('-') || l.startsWith('•') || l.startsWith('*')).map((l) => l.replace(/^[-•*]\s*/, ''));
  const hasMetrics = /\d+%|\$\d+|\d+\s*(users|requests|ms|x|clients|students|records)/i.test(rawText);
  const hasEducation = /university|college|b\.s|b\.a|m\.s|bachelor|master|gpa|degree/i.test(rawText);
  const hasProjects = /project|built|architected|github|developed/i.test(rawText);
  const hasCerts = /certified|certification|aws|coursera|specialization/i.test(rawText);

  const yearMatches = rawText.match(/(\d+(?:\.\d+)?)\+?\s*years?/i);
  const estimatedYearsExperience = yearMatches ? parseFloat(yearMatches[1]) : bullets.length >= 4 ? 1.5 : bullets.length >= 1 ? 0.5 : 0;

  const technicalScore = Math.min(96, Math.max(45, 42 + technicalSkills.length * 5));
  const experienceScore = Math.min(94, Math.max(42, 48 + bullets.length * 6 + (hasMetrics ? 14 : 0)));
  const educationScore = hasEducation ? 88 : 55;
  const projectScore = hasProjects ? (bullets.length >= 2 ? 84 : 72) : 52;
  const formattingScore = lines.length >= 10 && bullets.length >= 2 ? 86 : 66;
  const avgWordsPerLine = lines.reduce((acc, l) => acc + l.split(/\s+/).length, 0) / Math.max(1, lines.length);
  const readabilityScore = avgWordsPerLine <= 24 ? 85 : 68;

  const overallScore = Math.round(
    technicalScore * 0.3 +
      experienceScore * 0.25 +
      projectScore * 0.2 +
      educationScore * 0.1 +
      formattingScore * 0.08 +
      readabilityScore * 0.07
  );

  const firstBullet = bullets[0] || 'Developed software modules and collaborated with the team on project deliverables.';
  const improvedFirst = firstBullet.match(/\d+/)
    ? `${firstBullet.replace(/\.$/, '')}, improving overall system reliability and maintainability.`
    : `Engineered ${firstBullet.charAt(0).toLowerCase() + firstBullet.slice(1).replace(/\.$/, '')}, reducing manual processing overhead and improving delivery speed.`;

  const missingInfo: string[] = [];
  if (!candidateEmail) missingInfo.push('Professional email address');
  if (!hasMetrics) missingInfo.push('Quantified impact metrics (percentages, latency, or user counts)');
  if (!/github|linkedin|portfolio/i.test(rawText)) missingInfo.push('GitHub, LinkedIn, or portfolio URL');
  if (!hasCerts) missingInfo.push('Relevant certifications or verified coursework');

  const recommendedPool = ['TypeScript', 'Docker', 'PostgreSQL', 'CI/CD', 'Unit Testing', 'REST APIs', 'Git'];
  const skillRecommendations = recommendedPool.filter((s) => !technicalSkills.includes(s)).slice(0, 4);

  return {
    overallScore,
    technicalScore,
    experienceScore,
    educationScore,
    projectScore,
    formattingScore,
    readabilityScore,
    scoreExplanations: {
      overall: 'Computed from weighted sub-scores: Technical (30%), Experience (25%), Projects (20%), Education (10%), Formatting (8%), and Readability (7%).',
      technical: `Identified ${technicalSkills.length} normalized technical skills across languages, frameworks, and tooling.`,
      experience: `Evaluated ${bullets.length} structured action bullets${hasMetrics ? ' with quantified outcomes' : ' (add measurable metrics to boost this score)'}.`,
      education: hasEducation ? 'Detected recognized academic degree / university credential.' : 'No explicit academic degree or university section detected.',
      project: hasProjects ? 'Detected technical project implementation evidence.' : 'Add dedicated project entries detailing stack and outcomes.',
      formatting: lines.length >= 10 ? 'Structured multi-section layout with clear line separation.' : 'Document is sparse; organize into Skills, Experience, Projects, and Education sections.',
      readability: avgWordsPerLine <= 24 ? 'Concise line length supports rapid recruiter scanning.' : 'Shorten dense paragraphs into scannable action-oriented bullets.',
    },
    extractedData: {
      candidateName,
      email: candidateEmail,
      summary: `${candidateName} — ${targetRole ? `Candidate targeting ${targetRole}` : 'Technical candidate'} with verified skills in ${technicalSkills.slice(0, 5).join(', ') || 'core software tools'}.`,
      technicalSkills,
      softSkills: softSkills.length > 0 ? softSkills : ['Analytical Problem Solving', 'Team Collaboration'],
      estimatedYearsExperience,
      education: hasEducation
        ? [{ institution: lines.find((l) => /university|college|institute/i.test(l)) || 'Academic Institution', degree: lines.find((l) => /b\.s|m\.s|bachelor|master|computer|engineering/i.test(l)) || 'Degree Program', year: (rawText.match(/20\d{2}/) || [''])[0], details: '' }]
        : [],
      experience: bullets.length > 0
        ? [{ role: targetRole || 'Technical Contributor / Intern', company: 'Listed Organization', duration: 'Recent', highlights: bullets.slice(0, 4) }]
        : [],
      projects: hasProjects
        ? [{ name: 'Extracted Project Work', description: lines.find((l) => /project|built|developed/i.test(l)) || 'Technical implementation listed in resume.' }]
        : [],
      certifications: hasCerts ? lines.filter((l) => /certified|certification|specialization/i.test(l)).slice(0, 3) : [],
    },
    improvements: {
      grammarSuggestions: [
        'Begin each experience bullet with a strong past-tense action verb (Engineered, Architected, Automated).',
        hasMetrics ? 'Keep metric formatting consistent across bullets.' : 'Add concrete metrics (e.g., "% faster", "hours saved", "users served") to every role.',
      ],
      improvedSummary: `${targetRole || 'Software & AI'} candidate bringing hands-on proficiency in ${technicalSkills.slice(0, 5).join(', ') || 'modern engineering'} with a focus on measurable execution and clean system design.`,
      bulletComparisons: [
        {
          section: 'Experience / Project Highlight',
          original: firstBullet,
          improved: improvedFirst,
        },
      ],
      missingInformation: missingInfo,
      skillRecommendations,
      checklist: [
        { item: 'Professional contact & links present', done: Boolean(candidateEmail) },
        { item: 'Quantified impact metrics included', done: hasMetrics },
        { item: 'Structured Technical Skills section', done: technicalSkills.length >= 4 },
        { item: 'Education credentials detected', done: hasEducation },
      ],
    },
    aiProvider: 'local-nlp',
    fallbackNotice: 'Analyzed via CareerMatch Local NLP Engine (rule-based synonym ontology & heuristic rubric). Configure GEMINI_API_KEY in server environment for generative deep analysis.',
  };
}

export async function generateJobDescriptionAI(input: {
  title: string;
  company: string;
  experienceLevel: string;
  location: string;
}) {
  const ai = getGeminiClient();
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Generate a structured, fair, inclusive job description for:
Title: ${input.title}
Company: ${input.company}
Experience Level: ${input.experienceLevel}
Location: ${input.location}`,
        config: {
          systemInstruction: 'You are an expert technical recruiter. Write clear, non-biased job descriptions focused strictly on role responsibilities, measurable qualifications, and canonical technical skills.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              description: { type: Type.STRING },
              responsibilities: { type: Type.ARRAY, items: { type: Type.STRING } },
              requiredSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
              preferredSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
              softSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
              educationRequirement: { type: Type.STRING },
              minYearsExperience: { type: Type.NUMBER },
            },
            required: ['description', 'responsibilities', 'requiredSkills', 'preferredSkills', 'softSkills', 'educationRequirement', 'minYearsExperience'],
          },
        },
      });
      const data = JSON.parse((response.text ?? '{}').trim());
      return { ...data, aiProvider: 'gemini' as const };
    } catch (err) {
      console.warn('Gemini JD generation failed, using template fallback:', err);
    }
  }

  const lower = input.title.toLowerCase();
  const isML = lower.includes('ml') || lower.includes('machine learning') || lower.includes('ai') || lower.includes('data');
  const isFrontend = lower.includes('frontend') || lower.includes('react') || lower.includes('ui');

  return {
    description: `${input.company} is hiring a ${input.title} (${input.experienceLevel}) in ${input.location} to build reliable, user-centered software systems alongside cross-functional engineering teams.`,
    responsibilities: isML
      ? [
          'Design, train, and evaluate machine learning and NLP pipelines using Python',
          'Expose inference workflows through tested REST APIs and SQL data stores',
          'Monitor model accuracy, fairness metrics, and production latency',
        ]
      : [
          'Architect and deliver clean, maintainable application features across frontend and backend services',
          'Collaborate in code reviews, technical design docs, and sprint planning',
          'Write automated tests and uphold reliability across production deployments',
        ],
    requiredSkills: isML
      ? ['Python', 'Machine Learning', 'SQL', 'REST APIs']
      : isFrontend
      ? ['React', 'TypeScript', 'JavaScript', 'Tailwind CSS']
      : ['TypeScript', 'React', 'Node.js', 'SQL', 'Git'],
    preferredSkills: ['Docker', 'PostgreSQL', 'CI/CD', 'Unit Testing'],
    softSkills: ['Clear Written Communication', 'Analytical Thinking', 'Cross-Functional Collaboration'],
    educationRequirement: "Bachelor's Degree in Computer Science, Engineering, or equivalent practical experience",
    minYearsExperience: input.experienceLevel.toLowerCase().includes('intern') ? 0 : input.experienceLevel.toLowerCase().includes('senior') ? 4 : 1,
    aiProvider: 'local-nlp' as const,
    fallbackNotice: 'Generated using CareerMatch structured role templates (local fallback).',
  };
}

export async function generateCareerRoadmapAI(targetRole: string, currentSkills: string[]) {
  const ai = getGeminiClient();
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Create a step-by-step Career Roadmap for a candidate targeting "${targetRole}" whose current verified skills are: ${currentSkills.join(', ') || 'Foundational programming'}.`,
        config: {
          systemInstruction: 'Provide an actionable, realistic career development roadmap with sequenced learning milestones and portfolio projects.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              requiredSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
              missingSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
              milestones: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    order: { type: Type.INTEGER },
                    title: { type: Type.STRING },
                    duration: { type: Type.STRING },
                    skills: { type: Type.ARRAY, items: { type: Type.STRING } },
                    description: { type: Type.STRING },
                  },
                },
              },
              projects: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    outcome: { type: Type.STRING },
                  },
                },
              },
            },
            required: ['requiredSkills', 'missingSkills', 'milestones', 'projects'],
          },
        },
      });
      const data = JSON.parse((response.text ?? '{}').trim());
      const milestones = (data.milestones || []).map((m: Record<string, unknown>, idx: number) => ({
        ...m,
        id: m.id || `m-${idx + 1}`,
        completed: false,
      }));
      return { ...data, milestones, aiProvider: 'gemini' as const };
    } catch (err) {
      console.warn('Gemini roadmap failed, using local fallback:', err);
    }
  }

  const lower = targetRole.toLowerCase();
  const roleBank: Record<string, string[]> = {
    ml: ['Python', 'Machine Learning', 'NLP', 'PyTorch', 'SQL', 'FastAPI', 'Docker', 'CI/CD'],
    frontend: ['TypeScript', 'React', 'JavaScript', 'Tailwind CSS', 'REST APIs', 'Unit Testing', 'Git', 'CI/CD'],
    data: ['Python', 'SQL', 'PostgreSQL', 'Apache Spark', 'AWS', 'Docker', 'Git'],
    fullstack: ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'REST APIs', 'Docker', 'Unit Testing', 'CI/CD'],
  };
  const key = lower.includes('ml') || lower.includes('ai') ? 'ml' : lower.includes('data') ? 'data' : lower.includes('front') ? 'frontend' : 'fullstack';
  const requiredSkills = roleBank[key];
  const canonCurrent = new Set(currentSkills.map((s) => canonicalizeSkill(s).toLowerCase()));
  const missingSkills = requiredSkills.filter((s) => !canonCurrent.has(canonicalizeSkill(s).toLowerCase()));

  const milestones = [
    { id: 'm1', order: 1, title: `Core ${targetRole} Foundations`, duration: '2 weeks', skills: requiredSkills.slice(0, 2), description: 'Solidify core language idioms, data structures, and problem-solving patterns.', completed: canonCurrent.has(requiredSkills[0].toLowerCase()) },
    { id: 'm2', order: 2, title: 'Production Frameworks & Data Modeling', duration: '3 weeks', skills: requiredSkills.slice(2, 5), description: 'Build end-to-end APIs, database schemas, and modular domain logic.', completed: false },
    { id: 'm3', order: 3, title: 'Testing, Containers & Deployment', duration: '2 weeks', skills: requiredSkills.slice(5), description: 'Add automated unit/integration tests, Dockerfiles, and CI workflows.', completed: false },
    { id: 'm4', order: 4, title: 'Capstone Portfolio & Interview Readiness', duration: '2 weeks', skills: missingSkills.slice(0, 2), description: 'Publish a documented capstone project with live benchmarks and architecture notes.', completed: false },
  ];

  return {
    requiredSkills,
    missingSkills,
    milestones,
    projects: [
      { title: `${targetRole} Production Capstone`, outcome: `End-to-end application demonstrating ${requiredSkills.slice(0, 4).join(', ')} with automated tests.` },
      { title: 'Architecture & Benchmark Case Study', outcome: 'Written technical breakdown documenting trade-offs, latency, and schema design.' },
    ],
    aiProvider: 'local-nlp' as const,
    fallbackNotice: 'Generated using CareerMatch local skill taxonomy (fallback mode).',
  };
}

export async function generateInterviewQuestionsAI(params: {
  roleTitle: string;
  mode: string;
  resumeContext?: string;
  jobContext?: string;
}) {
  const ai = getGeminiClient();
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Generate 4 high-signal interview questions for the role "${params.roleTitle}" (Interview focus: ${params.mode}).
${params.resumeContext ? `Candidate context: ${params.resumeContext.slice(0, 3000)}` : ''}
${params.jobContext ? `Job context: ${params.jobContext.slice(0, 2000)}` : ''}`,
        config: {
          systemInstruction: 'You are a structured technical and behavioral interviewer. Return clear, realistic, non-trick questions tailored to the mode and context.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    index: { type: Type.INTEGER },
                    type: { type: Type.STRING },
                    question: { type: Type.STRING },
                  },
                },
              },
            },
            required: ['questions'],
          },
        },
      });
      const data = JSON.parse((response.text ?? '{}').trim());
      return { questions: data.questions || [], aiProvider: 'gemini' as const };
    } catch (err) {
      console.warn('Gemini interview question generation failed, using local fallback:', err);
    }
  }

  const questions = [
    { index: 0, type: params.mode.toUpperCase(), question: `Walk through the most technically challenging system or project you built relevant to ${params.roleTitle}, and explain one architectural trade-off you made.` },
    { index: 1, type: 'Problem Solving', question: `If a core service for ${params.roleTitle} suddenly showed a 3x latency regression after deployment, how would you isolate and resolve the root cause?` },
    { index: 2, type: 'Collaboration', question: 'Describe a time you received critical feedback on your technical work or code. How did you validate and integrate the changes?' },
    { index: 3, type: 'Role Alignment', question: `Which skills from ${params.roleTitle} are your strongest today, and what is your concrete 30-day plan for ramping up on any gaps?` },
  ];

  return {
    questions,
    aiProvider: 'local-nlp' as const,
    fallbackNotice: 'Generated using CareerMatch structured interview bank (local fallback).',
  };
}

export async function evaluateInterviewAnswerAI(params: {
  roleTitle: string;
  questionText: string;
  userAnswer: string;
}) {
  const ai = getGeminiClient();
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Evaluate this interview answer for "${params.roleTitle}".
Question: ${params.questionText}
Candidate Answer: ${params.userAnswer}`,
        config: {
          systemInstruction: 'Score the candidate answer fairly from 0 to 100 based on clarity, technical specificity, structured reasoning (STAR/trade-offs), and relevance. Provide constructive feedback and 2-3 actionable improvement tips.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.INTEGER },
              feedback: { type: Type.STRING },
              improvementTips: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['score', 'feedback', 'improvementTips'],
          },
        },
      });
      const data = JSON.parse((response.text ?? '{}').trim());
      return { ...data, aiProvider: 'gemini' as const };
    } catch (err) {
      console.warn('Gemini interview evaluation failed, using local fallback:', err);
    }
  }

  const words = params.userAnswer.trim().split(/\s+/).filter(Boolean).length;
  const hasMetrics = /\d+%|\d+x|\d+\s*(ms|seconds|users|requests)/i.test(params.userAnswer);
  const hasTradeoff = /because|trade-off|however|latency|scale|test|metric|collaborat/i.test(params.userAnswer);
  const score = Math.min(95, Math.max(45, 50 + Math.min(25, Math.floor(words / 4)) + (hasMetrics ? 12 : 0) + (hasTradeoff ? 10 : 0)));

  const tips: string[] = [];
  if (words < 35) tips.push('Expand your response to ~60-120 words with concrete implementation steps.');
  if (!hasMetrics) tips.push('Include a measurable result or outcome (latency, accuracy, or time saved).');
  if (!hasTradeoff) tips.push('Explicitly mention one trade-off or alternative you considered.');

  return {
    score,
    feedback: `Your answer (${words} words) addresses the prompt${hasTradeoff ? ' with structured reasoning' : ''}. ${hasMetrics ? 'Including quantitative impact strengthens credibility.' : 'Adding specific metrics and technical constraints will elevate this to a top-tier answer.'}`,
    improvementTips: tips.length > 0 ? tips : ['Practice delivering this summary concisely in under 90 seconds.'],
    aiProvider: 'local-nlp' as const,
    fallbackNotice: 'Evaluated via local heuristic rubric (fallback mode).',
  };
}
