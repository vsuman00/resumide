export type GoldRequirement = {
  type: string;
  value: string;
  quote: string;
  importance: string;
};
// Fictional, manually specified source truth for engineering regression only.
// These labels are not independent annotation or a representative domain corpus.
export const JOB_INTELLIGENCE_FIXTURES = [
  {
    id: "jd-standard-a",
    family: "synthetic-a",
    segment: "standard",
    text: "Requirements\n3 years experience in TypeScript required\nBachelor degree required\nAWS certification preferred\nLocated in Bengaluru\nWork authorization required\nResponsibilities\nDevelop reliable services",
    gold: [
      {
        type: "experience",
        value: "3 years experience in TypeScript required",
        quote: "3 years experience in TypeScript required",
        importance: "required",
      },
      {
        type: "skill",
        value: "TypeScript",
        quote: "3 years experience in TypeScript required",
        importance: "required",
      },
      {
        type: "education",
        value: "Bachelor degree required",
        quote: "Bachelor degree required",
        importance: "required",
      },
      {
        type: "certification",
        value: "AWS certification preferred",
        quote: "AWS certification preferred",
        importance: "preferred",
      },
      {
        type: "skill",
        value: "AWS",
        quote: "AWS certification preferred",
        importance: "preferred",
      },
      {
        type: "location",
        value: "Located in Bengaluru",
        quote: "Located in Bengaluru",
        importance: "required",
      },
      {
        type: "authorization",
        value: "Work authorization required",
        quote: "Work authorization required",
        importance: "required",
      },
      {
        type: "responsibility",
        value: "Develop reliable services",
        quote: "Develop reliable services",
        importance: "contextual",
      },
    ],
  },
  {
    id: "jd-adverse-b",
    family: "synthetic-b",
    segment: "adverse",
    text: "🌏 Fictional Software Engineer\nNo degree required\nNo visa sponsorship\nSQL required but preferred\nMust have 5–7 years professional experience\nCertification preferred\nHybrid location in Pune\nResponsibilities\nBuild tested services\nPreferred\nPython",
    gold: [
      {
        type: "education",
        value: "No degree required",
        quote: "No degree required",
        importance: "contextual",
      },
      {
        type: "authorization",
        value: "No visa sponsorship",
        quote: "No visa sponsorship",
        importance: "contextual",
      },
      {
        type: "skill",
        value: "SQL",
        quote: "SQL required but preferred",
        importance: "unknown",
      },
      {
        type: "experience",
        value: "Must have 5–7 years professional experience",
        quote: "Must have 5–7 years professional experience",
        importance: "required",
      },
      {
        type: "certification",
        value: "Certification preferred",
        quote: "Certification preferred",
        importance: "preferred",
      },
      {
        type: "location",
        value: "Hybrid location in Pune",
        quote: "Hybrid location in Pune",
        importance: "unknown",
      },
      {
        type: "responsibility",
        value: "Build tested services",
        quote: "Build tested services",
        importance: "contextual",
      },
      {
        type: "skill",
        value: "Python",
        quote: "Python",
        importance: "preferred",
      },
    ],
  },
] as const;
