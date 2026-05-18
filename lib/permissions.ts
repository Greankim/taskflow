import type { Role } from "./types";

export const isLeadOrAbove = (r: Role) => r === "team_lead" || r === "admin" || r === "root_admin";
export const isAdminOrAbove = (r: Role) => r === "admin" || r === "root_admin";
export const isRootAdmin = (r: Role) => r === "root_admin";

export function canManageTeams(role: Role) {
  return isLeadOrAbove(role);
}
export function canManageProjects(role: Role) {
  return isLeadOrAbove(role);
}
export function canManageTasks(role: Role) {
  return isLeadOrAbove(role);
}
export function canViewActivityLog(role: Role) {
  return isLeadOrAbove(role);
}
export function canSetUserRole(actor: Role, target: Role, newRole: Role) {
  if (!isAdminOrAbove(actor)) return false;
  if (target === "root_admin" || newRole === "root_admin") return isRootAdmin(actor);
  if (newRole === "admin" && !isRootAdmin(actor)) return false;
  return true;
}
