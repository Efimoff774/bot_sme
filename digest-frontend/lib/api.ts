import type { PeriodDetail, PeriodSummary } from "@/types/digest";

const getBaseUrl = (): string => {
  const url = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not set");
  }
  return url.replace(/\/$/, "");
};

export async function getPublishedPeriods(): Promise<PeriodSummary[]> {
  const base = getBaseUrl();
  const res = await fetch(`${base}/api/periods`);
  if (!res.ok) {
    throw new Error(`Failed to load periods: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getPeriodById(id: string): Promise<PeriodDetail> {
  const base = getBaseUrl();
  const res = await fetch(`${base}/api/periods/${id}`);
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("Not found");
    }
    throw new Error(`Failed to load period: ${res.status} ${res.statusText}`);
  }
  return res.json();
}
