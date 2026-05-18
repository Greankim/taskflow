import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { isAdminOrAbove } from "@/lib/permissions";
import { TaskBoard } from "@/components/TaskBoard";
import { InlineRename } from "@/components/InlineRename";

async function renameProject(formData: FormData) {
  "use server";
  const id = String(formData.get("project_id"));
  const name = String(formData.get("name") || "").trim();
  if (!name) return redirect(`/projects/${id}?error=ต้องระบุชื่อ`);

  // Verify caller is admin/root_admin OR lead of the project's team
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect("/login");
  const { data: actor } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const isAdmin = actor?.role === "admin" || actor?.role === "root_admin";

  const admin = createAdminSupabase();
  const { data: proj } = await admin.from("projects").select("team_id").eq("id", id).single();
  if (!proj) return redirect("/dashboard?error=ไม่พบโปรเจกต์");

  if (!isAdmin) {
    const { data: mem } = await admin.from("team_members")
      .select("role_in_team").eq("team_id", proj.team_id).eq("user_id", user.id).maybeSingle();
    if (mem?.role_in_team !== "lead") return redirect(`/projects/${id}?error=ต้องเป็น lead เท่านั้น`);
  }

  const { error } = await admin.from("projects").update({ name }).eq("id", id);
  if (error) return redirect(`/projects/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/projects/${id}`);
}

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params, searchParams,
}: { params: { id: string }; searchParams: { error?: string } }) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = profile?.role || "worker";

  const { data: project } = await supabase
    .from("projects").select("id, name, description, team_id").eq("id", params.id).single();
  if (!project) return <div>ไม่พบโปรเจกต์</div>;

  const { data: members } = await supabase
    .from("team_members").select("user_id, role_in_team, profiles(id, username)").eq("team_id", project.team_id);
  const memberList = (members || []).map((m: any) => m.profiles);

  // Effective management permission: admin/root OR team lead of THIS team
  const myMembership = (members || []).find((m: any) => m.user_id === user.id);
  const canManage = isAdminOrAbove(role as any) || myMembership?.role_in_team === "lead";

  return (
    <div className="space-y-6">
      {searchParams.error && (
        <div className="card p-3 border-l-4 border-status-late text-sm text-red-700">{searchParams.error}</div>
      )}
      <div className="flex items-center justify-between">
        <div>
          {canManage ? (
            <InlineRename
              initialValue={project.name}
              action={renameProject}
              hiddenFields={{ project_id: project.id }}
            />
          ) : (
            <h1 className="text-2xl font-bold">{project.name}</h1>
          )}
          <p className="text-sm text-black/60 mt-1">{project.description}</p>
        </div>
        <div className="flex gap-2">
          {canManage && (
            <Link href={`/projects/${project.id}/activity`} className="btn-secondary">Activity Log</Link>
          )}
          <Link href={`/teams/${project.team_id}`} className="text-sm text-brand-700 hover:underline self-center">← กลับทีม</Link>
        </div>
      </div>

      <TaskBoard
        projectId={project.id}
        canManage={canManage}
        currentUserId={user.id}
        members={memberList}
      />
    </div>
  );
}
