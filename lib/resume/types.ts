/** Structured resume, same shape Tsenta uses (so a Tsenta profile export drops straight in). */
export type ResumeData = {
  personalInformation: {
    firstName: string;
    middleName?: string;
    lastName: string;
    title?: string;
    email?: string;
    phone?: string;
    city?: string;
    state?: string;
    country?: string;
    linkedinUrl?: string;
    githubUrl?: string;
    website?: string;
    summary?: string;
  };
  education: { university: string; degree: string; major?: string; startDate?: string; endDate?: string }[];
  skillCategories: { name: string; order?: number; skills: string[] }[];
  workExperience: {
    company: string;
    role: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    responsibilities: string[];
    technologies?: string[];
  }[];
  projects: {
    title: string;
    details: string[];
    startDate?: string;
    endDate?: string;
    githubUrl?: string;
    liveUrl?: string;
    technologies?: string[];
  }[];
  certifications: { name: string; issuingOrganization?: string }[];
  hiddenSections?: string[];
};

export type TailoringChange = { kind: "keywords" | "summary" | "skills" | "bullets" | "score"; title: string; detail: string };

export type TailoredResume = {
  data: ResumeData;
  keywords: string[];
  matched: string[];
  changes: TailoringChange[];
  matchScore: number;
  engine: string;
};
