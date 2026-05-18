import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...args: ClassValue[]) {
  return twMerge(clsx(args));
}

export function isLate(deadline: string | null, status: string) {
  if (!deadline || status === "DONE") return false;
  const d = new Date(deadline);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

export function usernameToEmail(username: string) {
  return `${username.toLowerCase().trim()}@taskflow.app`;
}

export function fmtDate(d: string | Date | null) {
  if (!d) return "-";
  return new Date(d).toISOString().slice(0, 10);
}
