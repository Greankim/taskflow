export type Role = "root_admin" | "admin" | "team_lead" | "worker";
export type TaskStatus = "TODO" | "DOING" | "DONE";

export interface Profile {
  id: string;
  username: string;
  role: Role;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
}

export interface Project {
  id: string;
  team_id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  title: string;
  status: TaskStatus;
  deadline: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TaskWithAssignees extends Task {
  assignees: Pick<Profile, "id" | "username">[];
}

export interface ActivityLog {
  id: string;
  project_id: string;
  task_id: string | null;
  actor_id: string;
  action: string;
  payload: Record<string, unknown>;
  created_at: string;
}
