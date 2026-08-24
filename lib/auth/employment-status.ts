/** Employment Status options (master plan §4.1) — audience analytics only, never gates features. */
export const EMPLOYMENT_STATUSES = [
  "Student",
  "Seeking opportunities / unemployed",
  "Employed",
  "Employer / recruiter / hiring manager",
  "Other",
  "Prefer not to say",
] as const;

export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

export function isEmploymentStatus(value: string): value is EmploymentStatus {
  return (EMPLOYMENT_STATUSES as readonly string[]).includes(value);
}
