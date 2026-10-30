// The scenario files the backend knows about. Each month, add one import line.
// The backend uses them to check that saved answers are real choices.

import incidentFile01 from "../../site/scenarios/incident-file-01.json" with { type: "json" };

export interface ScenarioOption { id: string; title: unknown; short?: unknown }
export interface ScenarioScreen {
  id: string;
  type: string;
  title?: unknown;
  min?: number;
  max?: number;
  options?: ScenarioOption[];
  rows?: { id: string; dimension: string }[];
  whenOptions?: { id: string; label: string }[];
}
export interface Scenario {
  id: string;
  title: string;
  email?: import("./emails.ts").FileEmailContent;
  screens: ScenarioScreen[];
  threads: Record<string, { title: string; options: ScenarioOption[]; takeBack?: unknown }>;
}

const all: Scenario[] = [incidentFile01 as unknown as Scenario];

export const scenarios: Record<string, Scenario> = Object.fromEntries(all.map((s) => [s.id, s]));

// The file new readers get straight after confirming their email. Change this
// when a new month's file goes out.
export const CURRENT_FILE = "incident-file-01";
