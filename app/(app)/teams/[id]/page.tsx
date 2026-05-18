import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { canManageProjects, isLeadOrAbove, isAdminOrAbove } from "@/lib/permissions";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { InlineRename } from "@/components/InlineRename";
import { RoleSelect } from "@/components/RoleSelect";

export const dynamic = "force-dynamic";

async function createProject(formData: FormData) {
  "use server";
  const team_id = String(formData.get("team_id"));
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim() || null;
  if (!name) return;
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("projects").insert({ team_id, name, description, created_by: user.id });
  revalidatePath(`/teams/${team_id}`);
}

async function deleteProject(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const team_id = String(formData.get("team_id"));
  const supabase = createServerSupabase();
  await supabase.from("projects").delete().eq("id", id);
  revalidatePath(`/teams/${team_id}`);
}

async function genInvite(formData: FormData) {
  "use server";
  const team_id = String(formData.get("team_id"));
  const invited_username = String(formData.get("invited_username") || "").trim() || null;
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await supabase.from("team_invites").insert({
    team_id, code, invited_username, expires_at, created_by: user.id,
  });
  revalidatePath(`/teams/${team_id}`);
}

async function assertActorIsLead(team_id: string) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");
  const { data: actor } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!actor) throw new Error("unauthorized");
  if (actor.role === "admin" || actor.role === "root_admin") return user.id;
  const { data: mem } = await supabase
    .from("team_members").select("role_in_team").eq("team_id", team_id).eq("user_id", user.id).maybeSingle();
  if (mem?.role_in_team !== "lead") throw new Error("forbidden: not a team lead");
  return user.id;
}

async function setMemberRole(formData: FormData) {
  "use server";
  const team_id = String(formData.get("team_id"));
  const target_user_id = String(formData.get("user_id"));
  const role_in_team = String(formData.get("role_in_team"));
  if (role_in_team !== "lead" && role_in_team !== "member") return;

  const actorId = await assertActorIsLead(team_id);
  if (target_user_id === actorId) return; // can't change own role
  // protect root_admin: always remain lead
  const admin = createAdminSupabase();
  const { data: target } = await admin.from("profiles").select("role").eq("id", target_user_id).single();
  if (target?.role === "root_admin" && role_in_team !== "lead") return;

  const supabase = createServerSupabase();
  await supabase.from("team_members").update({ role_in_team }).eq("team_id", team_id).eq("user_id", target_user_id);
  revalidatePath(`/teams/${team_id}`);
}

async function removeMember(formData: FormData) {
  "use server";
  const team_id = String(formData.get("team_id"));
  const target_user_id = String(formData.get("user_id"));

  const actorId = await assertActorIsLead(team_id);
  if (target_user_id === actorId) return;
  // protect root_admin from being removed
  const admin = createAdminSupabase();
  const { data: target } = await admin.from("profiles").select("role").eq("id", target_user_id).single();
  if (target?.role === "root_admin") return;

  const supabase = createServerSupabase();
  await supabase.from("team_members").delete().eq("team_id", team_id).eq("user_id", target_user_id);
  revalidatePath(`/teams/${team_id}`);
}

async function renameTeam(formData: FormData) {
  "use server";
  const id = String(formData.get("team_id"));
  const name = String(formData.get("name") || "").trim();
  if (!name) return redirect(`/teams/${id}?error=ต้องระบุชื่อ`);

  // explicit lead-only check (admin/root_admin also pass)
  await assertActorIsLead(id);

  // use service_role to perform the update — bypasses any RLS surprise,
  // since we've already verified the actor is allowed
  const admin = createAdminSupabase();
  const { error } = await admin.from("teams").update({ name }).eq("id", id);
  if (error) return redirect(`/teams/${id}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(`/teams/${id}`);
  revalidatePath("/teams");
}

async function inviteByUsername(formData: FormData) {
  "use server";
  const team_id = String(formData.get("team_id"));
  const username = String(formData.get("username") || "").trim();
  if (!username) return;
  const admin = createAdminSupabase();
  const { data: target } = await admin.from("profiles").select("id").eq("username", username).single();
  if (!target) return redirect(`/teams/${team_id}?error=ไม่พบผู้ใช้`);
  await admin.from("team_members").upsert({ team_id, user_id: target.id, role_in_team: "member" });
  revalidatePath(`/teams/${team_id}`);
}

export default async function TeamDetail({
  params, searchParams,
}: { params: { id: string }; searchParams: { error?: string } }) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = profile?.role || "worker";

  const { data: team } = await supabase.from("teams").select("*").eq("id", params.id).single();
  if (!team) return <div>ไม่พบทีม</div>;

  const { data: members } = await supabase
    .from("team_members")
    .select("user_id, role_in_team, profiles(username, role)")
    .eq("team_id", params.id);

  const myMembership = (members || []).find((m: any) => m.user_id === user.id);
  const iAmTeamLead = isAdminOrAbove(role as any) || myMembership?.role_in_team === "lead";

  const { data: projects } = await supabase
    .from("projects").select("id, name, description, created_at")
    .eq("team_id", params.id).order("created_at", { ascending: false });

  const projectIds = (projects || []).map((p) => p.id);
  const { data: allTasks } = projectIds.length
    ? await supabase.from("tasks").select("project_id, status").in("project_id", projectIds)
    : { data: [] as { project_id: string; status: string }[] };
  const statsByProject: Record<string, { total: number; done: number }> = {};
  (allTasks || []).forEach((t: any) => {
    const s = statsByProject[t.project_id] ||= { total: 0, done: 0 };
    s.total++;
    if (t.status === "DONE") s.done++;
  });

  const { data: invites } = await supabase
    .from("team_invites")
    .select("id, code, invited_username, expires_at, used_by")
    .eq("team_id", params.id)
    .is("used_by", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6 max-w-5xl">
      {searchParams.error && (
        <div className="card p-3 border-l-4 border-status-late text-sm text-red-700">{searchParams.error}</div>
      )}
      <div className="flex items-center justify-between">
        {iAmTeamLead ? (
          <InlineRename
            initialValue={team.name}
            action={renameTeam}
            hiddenFields={{ team_id: team.id }}
          />
        ) : (
          <h1 className="text-2xl font-bold">{team.name}</h1>
        )}
        <Link href={`/teams`} className="text-sm text-brand-700 hover:underline">← ทีมทั้งหมด</Link>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">Projects</h2>
        {iAmTeamLead && (
          <form action={createProject} className="card p-4 mb-3 grid md:grid-cols-[1fr_2fr_auto] gap-3 items-end">
            <input type="hidden" name="team_id" value={team.id} />
            <div>
              <label className="text-xs font-medium text-black/60">ชื่อโปรเจกต์</label>
              <input name="name" placeholder="เช่น Sonic" required className="input mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-black/60">คำอธิบาย (option)</label>
              <input name="description" placeholder="รายละเอียดสั้น ๆ" className="input mt-1" />
            </div>
            <button className="btn-primary">+ สร้าง Project</button>
          </form>
        )}
        <div className="grid md:grid-cols-2 gap-3">
          {(projects || []).map((p) => {
            const s = statsByProject[p.id] || { total: 0, done: 0 };
            const pct = s.total === 0 ? 0 : Math.round((s.done / s.total) * 100);
            return (
              <div key={p.id} className="card p-4 space-y-2">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <Link href={`/projects/${p.id}`} className="font-medium hover:text-brand-700">{p.name}</Link>
                    {p.description && <p className="text-sm text-black/60">{p.description}</p>}
                  </div>
                  {iAmTeamLead && (
                    <ConfirmDeleteButton
                      action={deleteProject}
                      hiddenFields={{ id: p.id, team_id: team.id }}
                      title="ลบ Project"
                      message="การลบ project จะลบ tasks ทั้งหมดในนั้นด้วย"
                      itemName={p.name}
                    />
                  )}
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-black/60">ความคืบหน้า</span>
                    <span className="font-medium">{pct}% ({s.done}/{s.total})</span>
                  </div>
                  <div className="h-2 bg-black/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${pct === 100 ? "bg-status-done" : "bg-brand-700"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                {iAmTeamLead && (
                  <Link href={`/projects/${p.id}/activity`} className="text-xs text-brand-700 hover:underline inline-block">
                    ดู Activity Log →
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">สมาชิก</h2>
        <div className="card divide-y divide-black/5">
          {(members || []).map((m: any) => {
            const targetIsRoot = m.profiles.role === "root_admin";
            // root_admin is always treated as lead, regardless of DB row
            const effectiveRole = targetIsRoot ? "lead" : m.role_in_team;
            const canEditThisMember = iAmTeamLead && m.user_id !== user.id && !targetIsRoot;
            return (
              <div key={m.user_id} className="p-3 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="font-medium">@{m.profiles.username}</span>
                  {targetIsRoot && <span className="badge bg-black text-white text-[10px]">root</span>}
                </div>
                <div className="flex items-center gap-2">
                  {canEditThisMember ? (
                    <RoleSelect
                      action={setMemberRole}
                      hiddenFields={{ team_id: team.id, user_id: m.user_id }}
                      initialValue={effectiveRole}
                    />
                  ) : (
                    <span className={`badge ${effectiveRole === "lead" ? "bg-brand-700 text-white" : "bg-brand-100 text-brand-800"}`}>
                      {effectiveRole}
                    </span>
                  )}
                  {canEditThisMember && (
                    <ConfirmDeleteButton
                      action={removeMember}
                      hiddenFields={{ team_id: team.id, user_id: m.user_id }}
                      label="เอาออก"
                      title="นำสมาชิกออก"
                      message="ผู้ใช้นี้จะถูกนำออกจากทีม"
                      itemName={`@${m.profiles.username}`}
                      className="btn-danger text-xs"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {iAmTeamLead && (
        <section>
          <h2 className="text-lg font-semibold mb-3">เชิญสมาชิก</h2>
          <div className="grid md:grid-cols-2 gap-3">
            <form action={genInvite} className="card p-4 space-y-2">
              <div className="text-sm font-medium">สร้าง Invite Code 6 หลัก (หมดอายุใน 24 ชม.)</div>
              <input type="hidden" name="team_id" value={team.id} />
              <input name="invited_username" placeholder="(option) username เฉพาะคน" className="input" />
              <button className="btn-primary w-full">สร้าง Code</button>
            </form>
            <form action={inviteByUsername} className="card p-4 space-y-2">
              <div className="text-sm font-medium">เชิญด้วย username (เพิ่มทันที)</div>
              <input type="hidden" name="team_id" value={team.id} />
              <input name="username" required placeholder="username" className="input" />
              <button className="btn-secondary w-full">เพิ่มเข้าทีม</button>
            </form>
          </div>

          {(invites || []).length > 0 && (
            <div className="card mt-3 divide-y divide-black/5">
              <div className="p-3 text-sm font-medium">Code ที่ยังใช้ได้</div>
              {(invites || []).map((i: any) => (
                <div key={i.id} className="p-3 flex justify-between text-sm">
                  <div>
                    <span className="font-mono text-lg font-bold text-brand-800">{i.code}</span>
                    {i.invited_username && <span className="ml-3 text-black/60">→ @{i.invited_username}</span>}
                  </div>
                  <div className="text-black/50">หมดอายุ {new Date(i.expires_at).toLocaleString("th-TH")}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
