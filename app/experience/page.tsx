import type { Metadata } from "next";

import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Timeline, type TimelineEntry } from "@/components/experience/Timeline";

export const metadata: Metadata = {
  title: "Experience — James Imbuido",
  description:
    "Professional experience and education — data scientist at Commonwealth Bank of Australia.",
};

const experienceEntries: TimelineEntry[] = [
  {
    period: "Feb 2026 — Present",
    title: "Associate Data Scientist",
    organisation: "Commonwealth Bank of Australia",
    type: "Full-time · Hybrid",
    location: "Melbourne, Victoria",
    tags: [
      "LangChain",
      "LangGraph",
      "Artificial Intelligence (AI)",
      "DeepEval",
      "PydanticAI",
      "Generative AI",
      "Machine Learning",
      "Agentic AI",
      "Prompt Engineering",
      "Amazon Web Services (AWS)",
      "Mathematics",
      "NumPy",
      "Pandas (Software)",
      "R",
      "PySpark",
      "SQL",
      "Snowflake",
      "Teradata",
      "Data Science",
      "Data Analysis",
    ],
    sections: [
      {
        heading: "AI-Capabilities · SuperVerse",
        items: [
          "Implemented SQL queries to ensure the automated modeling software directs to the relevant data tables. Involved technologies include SQL, Snowflake, GDW, and Teradata.",
        ],
      },
      {
        heading: "AI-Powered Engineering (AIPE) · GenFolio",
        items: [
          "As Data Science & AI lead, architected a generative-AI and agentic solution and scaled it from proof-of-concept into a deployed production web application used by ~1,000+ internal engineers — built on AWS, Vercel AI, and Anthropic's Claude foundation models.",
          "Ran generative-AI and agentic evaluations of AI solutions in production, improving evaluation scores by ~20% using LLM-as-a-judge and a fully automated, self-improving pipeline on GitHub Actions with HoneyHive.",
          "The manual documentation and preparation for periodic managerial conversations and performance reviews were addressed by the Generative AI solution (GenFolio), streamlining this process from weeks to a few hours.",
        ],
      },
      {
        heading: "AI Adoption & Community Engagement",
        items: [
          "Initiated and delivered CBA's Claude Code beginner workshops — 2,000+ participants across Melbourne (372), Sydney (1,000), and Perth (650) — running the Melbourne sessions independently.",
          "Presented CBA's AIPE-in-Action event, delivering a workshop on advanced Claude Code topics and techniques.",
          "Facilitated and presented at CBA's internal Data Science Graduate Learning Lab.",
          "Mentored high-school students through ABCN programs.",
          "Networked with future and aspiring tech talent across the University of Melbourne, CBA, and Swinburne University.",
        ],
      },
    ],
  },
  {
    period: "Feb 2025 — Feb 2026",
    title: "Graduate Data Scientist",
    organisation: "Commonwealth Bank of Australia",
    type: "Full-time",
    location: "Australia",
    tags: [
      "LangChain",
      "LangGraph",
      "Artificial Intelligence (AI)",
      "DeepEval",
      "PydanticAI",
      "Generative AI",
      "Machine Learning",
      "Agentic AI",
      "Prompt Engineering",
      "Amazon Web Services (AWS)",
      "Mathematics",
      "NumPy",
      "Pandas (Software)",
      "R",
      "PySpark",
      "Data Science",
      "Data Analysis",
    ],
    sections: [
      {
        heading:
          "Rotation 2 · AI-Powered Engineering (AIPE) Management · GenFolio",
        items: [
          "Key developer and data scientist productionising GenFolio for the Engineering Practice — deployed an MVP to production within 3 months of starting development.",
          "Ran multiple pilot groups for continuous product testing and improvement.",
          "Provided data-science support to AIPE and panelled and mentored for NSW VET.",
        ],
      },
      {
        heading: "Hackathon25! · Collabor(A.I.)te & Innovate · GenFolio",
        items: [
          "Competed in a company-wide technology hackathon against 260+ CBA teams across Australia and India — placed 1st in the group's first-ever company-wide hackathon.",
          "Deliberated with internal group departments on scaling and productionising the product, gaining exclusive executive sponsorship from the group's Chief Information Officer (CIO) for Technology.",
        ],
      },
      {
        heading: "Rotation 1 · General Audit & Assurance (GA&A)",
        items: [
          "Integrated agentic GenAI frameworks and agents into a Retrieval-Augmented Generation (RAG) and LLM codebase infrastructure.",
          "Presented and facilitated keynotes to the wider team on AI, Data & Analytics, and agentic AI agents.",
          "Completed ad-hoc data-science support and consultations for audit groups to achieve group-focused audit outcomes.",
          "Facilitated a 2-week immersive sprint with group auditors on getting the most from the automated audit pipeline — iterating on immediate customer feedback and covering AI, agents, and LLM governance and model risk.",
        ],
      },
      {
        heading: "Graduate Modelling Project · Consumer Finance",
        items: [
          "Evaluated an initial machine-learning model for suspected bias.",
          "Rectified the discovered biases in the second iteration of the model.",
          "Presented outcomes to stakeholders, covering both technical and business aspects.",
        ],
      },
    ],
  },
  {
    period: "Jan 2023 — Feb 2025",
    title: "Registered Nurse and Case Manager",
    organisation: "Eastern Health",
    type: "Full-time",
    location: "Maroondah, Victoria",
    summary:
      "Provided evidence-based mental-health nursing care for residents and clients, working from care plans developed collaboratively with the client, their medical officer, and the wider care team — including case management of short- and long-term clients to support optimal rehabilitation.",
  },
  {
    period: "Oct 2021 — Dec 2022",
    title: "Registered Undergraduate Student Nurse (RUSON)",
    organisation: "Eastern Health",
    type: "Part-time",
    location: "Victoria",
    summary:
      "Supported the nursing team in delivering safe, effective care across vaccination clinics, the emergency department, and the renal unit — through both administrative and clinical tasks.",
  },
  {
    period: "Jul 2021 — Dec 2022",
    title: "Support Worker",
    organisation: "Compassion Care Network",
    type: "Part-time",
    summary:
      "Supported people with disabilities in their homes to promote independent living — assisting with activities of daily living, coordinating care plans with other healthcare providers, and facilitating a range of social activities.",
  },
  {
    period: "Feb 2022 — May 2022",
    title: "Nursing Student",
    organisation: "Monash Health",
    type: "Internship",
    location: "Dandenong Hospital",
    sections: [
      {
        items: [
          "Provided evidence-based nursing care for patients, working from care plans developed collaboratively with the patient, their medical officer, and the wider care team.",
          "Carried full patient loads on each placement — 4 patients in Paediatric Oncology and 1–2 in ICU.",
          "Cared for patients with ventilators, tracheostomies, drains, PCAs, CVCs, PICCs, ART lines, and COVID-19 risk.",
        ],
      },
    ],
  },
  {
    period: "Jan 2022 — Feb 2022",
    title: "Nursing Student",
    organisation: "Ramsay Health Care",
    type: "Internship",
    location: "Mitcham, Victoria",
    summary:
      "Provided evidence-based mental-health nursing care for residents and clients, working from care plans developed collaboratively with the client, their medical officer, and the care team.",
  },
  {
    period: "Jan 2022",
    title: "Nursing Student",
    organisation: "Peninsula Health",
    type: "Internship",
    location: "Frankston, Victoria",
    summary:
      "Provided evidence-based general-surgery nursing care for residents and clients, working from collaborative care plans.",
  },
  {
    period: "Jun 2021 — Jul 2021",
    title: "Nursing Student",
    organisation: "Kingston Rehabilitation & Nursing Center",
    type: "Internship",
    location: "Melbourne, Victoria",
    summary:
      "Provided evidence-based rehabilitation nursing care for residents and clients, working from collaborative care plans.",
  },
  {
    period: "Jan 2021 — Feb 2021",
    title: "Admissions Officer",
    organisation: "Box Hill Institute",
    type: "Contract",
    location: "Victoria",
    sections: [
      {
        items: [
          "Evaluated student applications and made admissions decisions — reviewing transcripts, test scores, references, and personal statements.",
          "Conducted interviews and made recommendations to the Admissions Committee.",
        ],
      },
    ],
  },
  {
    period: "Nov 2020 — Dec 2020",
    title: "Call Center & Customer Experience Representative",
    organisation: "Box Hill Institute",
    type: "Contract",
    location: "Victoria",
    summary:
      "Answered customer questions, resolved their issues, and provided a positive and helpful customer experience.",
  },
  {
    period: "Jun 2020 — Jul 2020",
    title: "Nursing Student",
    organisation: "Peter James Center",
    type: "Internship",
    location: "Melbourne, Victoria",
    summary:
      "Provided evidence-based nursing care for aged-care residents and clients, working from care plans developed collaboratively with the client, their medical officer, and the care team.",
  },
  {
    period: "2017",
    title: "Retail Sales Associate",
    organisation: "MYER",
    type: "Part-time",
    location: "Knoxfield, Victoria",
  },
];

const educationEntries: TimelineEntry[] = [
  {
    period: "Jan 2023 — Aug 2024",
    title: "Master of Data Science",
    organisation: "James Cook University",
    tags: ["Generative AI", "Artificial Intelligence (AI)"],
    summary:
      "Two-year full-time accredited degree in data science and computer science, completed in 1 year 8 months and awarded with Distinction.",
  },
  {
    period: "Mar 2020 — Dec 2022",
    title: "Bachelor of Nursing",
    organisation: "Monash University",
    summary:
      "Three-year full-time AHPRA-certified degree, awarded with Distinction.",
  },
  {
    period: "2014 — 2019",
    title: "Victorian Certificate of Education",
    organisation: "Emmaus College",
    summary: "High school diploma — awarded with a 92.95 ATAR.",
    sections: [
      {
        heading: "Activities & Societies",
        items: [
          "Tennis Team Inter-School Sport Captain",
          "Table Tennis Team Inter-School Sport Captain",
          "Badminton Inter-School Sport Player (ranked 4th)",
          "Soccer Inter-School Sport Player",
          "Athletics Inter-School Sport Athlete (field and track)",
          "Art Committee Member",
          "Musical Production Cast Member (Hairspray)",
          "Vinnies Victoria Committee Member",
          "Junior High Representative",
        ],
      },
    ],
  },
];

export default function ExperiencePage() {
  return (
    <Container className="py-16 sm:py-24">
      <SectionHeading
        as="h1"
        title="Experience"
        description="Professional experience and education — data scientist at Commonwealth Bank of Australia."
      />
      <SectionHeading
        as="h2"
        kicker="Career"
        title="Professional experience"
        className="mt-16"
      />
      <Timeline entries={experienceEntries} />
      <SectionHeading
        as="h2"
        kicker="Education"
        title="Education"
        description="Degrees, certifications, and structured learning."
        className="mt-16"
      />
      <Timeline entries={educationEntries} />
    </Container>
  );
}
