import { redirect } from "next/navigation";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";

async function joinAction(formData: FormData) {
  "use server";
  const code = String(formData.get("code") || "").trim();
  if (!/^\d{6}$/.test(code)) return redirect("/teams/join?error=โค้ดต้องเป็น 6 หลัก");
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect("/login");

  const admin = createAdminSupabase();
  const { data: invite } = await admin
    .from("team_invites")
    .select("id, team_id, invited_username, expires_at, used_by")
    .eq("code", code).maybeSingle();
  if (!invite) return redirect("/teams/join?error=ไม่พบโค้ด");
  if (invite.used_by) return redirect("/teams/join?error=โค้ดถูกใช้แล้ว");
  if (new Date(invite.expires_at) < new Date()) return redirect("/teams/join?error=โค้ดหมดอายุ");
  if (invite.invited_username) {
    const { data: me } = await admin.from("profiles").select("username").eq("id", user.id).single();
    if (me?.username !== invite.invited_username)
      return redirect("/teams/join?error=โค้ดนี้สำหรับผู้ใช้รายอื่น");
  }
  await admin.from("team_members").upsert({
    team_id: invite.team_id, user_id: user.id, role_in_team: "member",
  });
  await admin.from("team_invites").update({ used_by: user.id, used_at: new Date().toISOString() }).eq("id", invite.id);
  redirect(`/teams/${invite.team_id}`);
}

export default function JoinPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-bold mb-4">เข้าร่วมทีมด้วย Code</h1>
      <form action={joinAction} className="card p-6 space-y-4">
        <div>
          <label className="text-sm font-medium">รหัส 6 หลัก</label>
          <input name="code" required pattern="\d{6}" maxLength={6}
            className="input mt-1 font-mono text-center text-2xl tracking-widest" />
        </div>
        {searchParams.error && <p className="text-sm text-red-600">{searchParams.error}</p>}
        <button className="btn-primary w-full">เข้าร่วม</button>
      </form>
    </div>
  );
}
