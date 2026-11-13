export type UserRole = 'student' | 'recruiter' | 'admin';

export interface User {
  id: number;
  email: string;
  role: UserRole;
  full_name: string;
  phone?: string;
  location?: string;
  headline?: string;
  company_name?: string;
  company_website?: string;
  email_verified: number;
  verification_token?: string | null;
  status: 'active' | 'suspended';
  is_demo?: number;
  created_at?: string;
}

export interface StudentProfile {
  user_id: number;
  university: string;
  degree: string;
  graduation_year: string;
  bio: string;
  target_role: string;
  skills: string[];
  softSkills: string[];
  experience_years: number;
  linkedin_url: string;
  portfolio_url: string;
  profile_completion: number;
}

export interface RecruiterProfile {
  user_id: number;
  company_name: string;
  industry: string;
  company_size: string;
  department: string;
  blind_screening_default: number;
  bio: string;
}

export interface ExplainableMatch {
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

export interface ResumeRecord {
  id: number;
  original_filename: string;
  file_type: string;
  file_size: number;
  is_duplicate: number;
  version_number: number;
  created_at: string;
  raw_text: string;
  analysis_id?: number;
  overall_score: number;
  technical_score: number;
  experience_score: number;
  education_score: number;
  project_score: number;
  formatting_score: number;
  readability_score: number;
  ai_provider: 'gemini' | 'local-nlp';
  scoreExplanations: Record<string, string>;
  extractedData: {
    candidateName: string;
    email: string;
    summary: string;
    technicalSkills: string[];
    softSkills: string[];
    estimatedYearsExperience?: number;
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
}

export interface JobListing {
  id: number;
  title: string;
  company: string;
  location: string;
  job_type: string;
  experience_level: string;
  min_years_experience: number;
  education_requirement: string;
  salary_range: string;
  description: string;
  responsibilities: string[];
  requiredSkills: string[];
  preferredSkills: string[];
  softSkills: string[];
  status?: string;
  blind_mode: boolean;
  is_demo?: boolean;
  created_at: string;
  isSaved?: boolean;
  applicationStatus?: string | null;
  compatibility?: ExplainableMatch | null;
  applicantCount?: number;
  shortlistedCount?: number;
}

export interface NotificationItem {
  id: number;
  title: string;
  message: string;
  category: string;
  link_tab: string;
  is_read: number;
  created_at: string;
}
