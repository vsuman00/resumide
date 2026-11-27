// Versioned matching vocabulary. Data, not logic: a change here is a new matcher version.
// Sources and licences are recorded per entry. O*NET hot technologies are imported (ATS-D1,
// approved 2026-11-27); ESCO is not, because its terms were not verified.
import { SKILL_TAXONOMY } from "./taxonomy";
import { ONET_TECHNOLOGY } from "./onet-technology.generated";
export { ONET_ATTRIBUTION } from "~/lib/onet-attribution";
import { SOFTWARE_SKILLS } from "../job-requirements";

export const VOCABULARY_VERSION = "match-vocabulary/2026-11-27.1";

export interface VocabularySkill {
  id: string;
  canonical: string;
  aliases: readonly string[];
  source:
    | "taxonomy-v1"
    | "software-skills"
    | "reviewed-manual"
    | "onet-hot-technology";
  licence: "project-owned" | "CC-BY-4.0 (O*NET 31.0)";
}
export interface DegreeLevel {
  level: 2 | 3 | 4 | 5;
  name: string;
  aliases: readonly string[];
}

const manual = (
  canonical: string,
  aliases: readonly string[] = [],
): VocabularySkill => ({
  id: canonical
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, ""),
  canonical,
  aliases,
  source: "reviewed-manual",
  licence: "project-owned",
});

const REVIEWED: VocabularySkill[] = [
  manual("Google Cloud Platform", ["GCP", "Google Cloud"]),
  manual("Kubernetes", ["K8s"]),
  manual("Large language models", ["LLM", "LLMs", "large language model"]),
  manual("Natural language processing", ["NLP"]),
  manual("Machine learning", ["ML"]),
  manual("Machine learning infrastructure", [
    "ML infrastructure",
    "ML infra",
    "MLOps",
  ]),
  manual("Artificial intelligence", ["AI"]),
  manual("Deep learning", []),
  manual("Distributed systems", [
    "distributed system",
    "distributed computing",
  ]),
  manual("Data structures and algorithms", [
    "data structures",
    "algorithms",
    "algorithm design",
  ]),
  manual("System design", ["systems design", "architecture design"]),
  manual("Object-oriented programming", [
    "OOP",
    "object oriented design",
    "object-oriented design",
  ]),
  manual("Microservices", ["microservice", "service-oriented architecture"]),
  manual("REST APIs", [
    "REST",
    "RESTful",
    "REST API",
    "RESTful APIs",
    "web APIs",
  ]),
  manual("GraphQL", []),
  manual("Terraform", []),
  manual("Linux", ["Unix"]),
  manual("Agile", ["Scrum", "Kanban"]),
  // Non-software pack (R-06, 2026-11-26): finance, people operations, support, healthcare,
  // operations and engineering. Reviewed by hand, project-owned, no external import (ATS-D1).
  manual("QuickBooks", ["QuickBooks Online"]),
  manual("SAP", ["SAP ERP", "SAP S/4HANA"]),
  manual("Salesforce", ["Salesforce CRM", "SFDC"]),
  manual("Microsoft Excel", ["Excel", "advanced Excel"]),
  manual("Financial modeling", ["financial modelling", "financial models"]),
  manual("Bloomberg", ["Bloomberg Terminal"]),
  manual("CFA", ["Chartered Financial Analyst"]),
  manual("CPA", ["Certified Public Accountant"]),
  manual("Month-end close", ["month end close", "monthly close"]),
  manual("Financial reporting", []),
  manual("Accounts payable", ["AP"]),
  manual("Accounts receivable", ["AR"]),
  manual("Workday", ["Workday HCM"]),
  manual("HRIS", ["HR information system", "HRIS systems"]),
  manual("Employee onboarding", ["onboarding", "new hire onboarding"]),
  manual("Employment law", ["labor law", "employment regulations"]),
  manual("SHRM certification", ["SHRM-CP", "SHRM-SCP", "SHRM"]),
  manual("Zendesk", []),
  manual("Freshdesk", []),
  manual("Customer support", ["customer service", "customer care"]),
  manual("Escalated customer issues", ["escalations", "escalated issues"]),
  manual("Google Classroom", []),
  manual("Differentiated instruction", ["differentiated learning"]),
  manual("Teaching license", ["teaching certificate", "teaching credential"]),
  manual("RN license", ["registered nurse license", "active RN license"]),
  manual("Basic life support", ["BLS"]),
  manual("Advanced cardiac life support", ["ACLS"]),
  manual("Ventilator management", ["mechanical ventilation"]),
  manual("Critical care", ["intensive care", "ICU"]),
  manual("Demand forecasting", ["demand planning", "forecasting"]),
  manual("Inventory management", ["inventory control"]),
  manual("Supply chain planning", ["supply chain management"]),
  manual("Six Sigma", ["Lean Six Sigma"]),
  manual("Lean", ["lean manufacturing"]),
  manual("SolidWorks", ["Solidworks"]),
  manual("AutoCAD", []),
  manual("GD&T", ["GDT", "geometric dimensioning and tolerancing"]),
  manual("Finite element analysis", ["FEA", "FEM"]),
  manual("Injection molding", ["injection moulding"]),
  manual("Shell scripting", ["Bash", "shell scripts"]),
  manual("Kafka", ["Apache Kafka"]),
  manual("Spark", ["Apache Spark", "PySpark"]),
  manual("Hadoop", []),
  manual("TensorFlow", []),
  manual("PyTorch", []),
  manual("Go", ["Golang"]),
  manual("Rust", []),
  manual("Scala", []),
  manual("Kotlin", []),
  manual("Swift", []),
  manual("Ruby", ["Ruby on Rails"]),
  manual("PHP", []),
  manual("MongoDB", []),
  manual("MySQL", []),
  manual("Elasticsearch", ["Elastic Search"]),
  manual("Prometheus", []),
  manual("Observability", ["monitoring and alerting"]),
  manual("Site reliability engineering", ["SRE"]),
  manual("DevOps", []),
  manual("Unit testing", ["unit tests", "test-driven development", "TDD"]),
  manual("Code review", ["code reviews"]),
  manual("Technical leadership", [
    "tech lead",
    "technical lead",
    "lead engineers",
    "led engineers",
  ]),
  manual("Mentoring", ["mentor", "mentorship", "coaching"]),
  manual("Project management", ["program management", "managing projects"]),
  manual("Stakeholder management", [
    "stakeholder communication",
    "stakeholders",
    "stakeholder",
    "cross-functional collaboration",
  ]),
  manual("Data analysis", ["data analytics", "analytics"]),
  manual("Statistics", ["statistical analysis", "statistical modeling"]),
  manual("A/B testing", ["AB testing", "experimentation"]),
  manual("Product management", []),
  manual("Salesforce", []),
  manual("Tableau", []),
  manual("Power BI", ["PowerBI"]),
  manual("Excel", ["Microsoft Excel"]),
  manual("Jest", []),
  manual("Mocha", []),
  manual("Cypress", []),
  manual("Playwright", []),
  manual("Express", ["Express.js", "ExpressJS"]),
  manual("HTML", ["HTML5"]),
  manual("CSS", ["CSS3", "Sass", "SCSS"]),
  manual("Accessibility", ["web accessibility", "accessible", "WCAG", "a11y"]),
  manual("User interfaces", [
    "user interface",
    "UI development",
    "front-end",
    "frontend",
    "front end",
  ]),
  manual("gRPC", []),
  manual("Threat modeling", ["threat model", "threat models"]),
  manual("Penetration testing", ["pen testing", "pentesting", "pen test"]),
  manual("Incident response", ["incident management", "on-call"]),
  manual("Infrastructure as code", ["IaC"]),
  manual("SEO", ["search engine optimization"]),
  manual("Content strategy", ["content marketing"]),
  manual("Google Analytics", ["GA4"]),
  manual("Email marketing", ["email campaigns", "email campaign"]),
  manual("Digital marketing", []),
  manual("Roadmap planning", ["product roadmap", "roadmap", "roadmapping"]),
  manual("Operational excellence", []),
];

const fromTaxonomy: VocabularySkill[] = SKILL_TAXONOMY.entries.map((e) => ({
  id: e.id,
  canonical: e.canonical,
  aliases: e.aliases,
  source: "taxonomy-v1",
  licence: "project-owned",
}));
const fromSoftware: VocabularySkill[] = SOFTWARE_SKILLS.map((name) => ({
  id: name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, ""),
  canonical: name,
  aliases: [],
  source: "software-skills",
  licence: "project-owned",
}));

const fromOnet: VocabularySkill[] = ONET_TECHNOLOGY.map((e) => ({
  id: e.canonical
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, ""),
  canonical: e.canonical,
  aliases: e.aliases,
  source: "onet-hot-technology",
  licence: "CC-BY-4.0 (O*NET 31.0)",
}));

// Earlier sources win on id and canonical name; aliases from later duplicates are merged in.
const merged = new Map<string, VocabularySkill>();
for (const skill of [
  ...fromTaxonomy,
  ...REVIEWED,
  ...fromSoftware,
  ...fromOnet,
]) {
  const key = skill.canonical.toLowerCase();
  const existing = merged.get(key);
  merged.set(
    key,
    existing
      ? {
          ...existing,
          aliases: [...new Set([...existing.aliases, ...skill.aliases])],
        }
      : skill,
  );
}
export const SKILLS: readonly VocabularySkill[] = [...merged.values()];

// A broad skill is evidenced by any of its members (ids of SKILLS). Reviewed list; grows with
// the vocabulary source decision ATS-D1.
export const SKILL_CLASSES: Readonly<Record<string, readonly string[]>> = {
  "digital-marketing": [
    "seo",
    "content-strategy",
    "email-marketing",
    "google-analytics",
  ],
};

export const DEGREE_LEVELS: readonly DegreeLevel[] = [
  {
    level: 2,
    name: "associate",
    aliases: ["associate", "associates", "associate's", "a.s.", "a.a."],
  },
  {
    level: 3,
    name: "bachelor",
    aliases: [
      "bachelor",
      "bachelors",
      "bachelor's",
      "b.s.",
      "b.s",
      "bs",
      "bsc",
      "b.sc",
      "b.e.",
      "b.tech",
      "btech",
      "ba",
      "b.a.",
      "undergraduate degree",
      "degree",
    ],
  },
  {
    level: 4,
    name: "master",
    aliases: [
      "master",
      "masters",
      "master's",
      "m.s.",
      "m.s",
      "ms",
      "msc",
      "m.sc",
      "mba",
      "m.tech",
      "mtech",
      "m.eng",
    ],
  },
  {
    level: 5,
    name: "doctorate",
    aliases: ["phd", "ph.d.", "ph.d", "doctorate", "doctoral", "d.phil"],
  },
];

// Generic job-posting words that never form a requirement on their own.
export const STOPWORDS: ReadonlySet<string> = new Set(
  (
    "a an and are as at be been being by can do does for from had has have if in into is it its of on or " +
    "our out so than that the their them then there these they this those to up us was we were what when " +
    "where which who will with within you your about above across after all also any around because " +
    "before both but each either else every few how just may more most much must need needs new no nor " +
    "not now off only other over own same should since some such through under until very want wants " +
    "while would professional modern non scalable one two three four five six seven eight nine ten first second " +
    "ability able advanced bonus candidate candidates company excellent experience experienced " +
    "expert expertise familiarity good great help hire hiring including knowledge looking minimum " +
    "preferred plus qualifications qualification required requirement requirements responsibilities " +
    "responsibility role roles seeking strong understanding using work working year years equivalent " +
    "practical exposure based demonstrated proven relevant related similar etc e.g i.e eg ie " +
    "including include includes join ensure ensuring " +
    "degree bachelor bachelors master masters phd doctorate"
  ).split(" "),
);
