import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { usernameToEmail } from "@/lib/utils";

async function registerAction(formData: FormData) {
  "use server";
  const username = String(formData.get("username") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  if (!username || password.length < 6)
    return redirect("/register?error=ข้อมูลไม่ครบหรือรหัสผ่านสั้นเกินไป");
  if (!/^[a-z0-9_.-]+$/.test(username))
    return redirect("/register?error=username ต้องเป็น a-z 0-9 _ . - เท่านั้น");

  const admin = createAdminSupabase();

  // duplicate check
  const { data: existing } = await admin
    .from("profiles").select("id").eq("username", username).maybeSingle();
  if (existing) return redirect("/register?error=username นี้ถูกใช้แล้ว");

  // create auth user with email pre-confirmed → ไม่ส่ง email → ไม่โดน rate limit
  const email = usernameToEmail(username);
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { username },
  });
  if (error) return redirect(`/register?error=${encodeURIComponent(error.message)}`);

  // ensure profile row (trigger may create it, but upsert to be safe)
  await admin.from("profiles").upsert({
    id: data.user!.id, username, role: "worker",
  });

  // sign user in
  const supabase = createServerSupabase();
  await supabase.auth.signInWithPassword({ email, password });

  redirect("/dashboard");
}

export default function RegisterPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <form action={registerAction} className="space-y-4">
      <h2 className="text-lg font-semibold">สมัครสมาชิก</h2>
      <div>
        <label className="text-sm font-medium">ชื่อผู้ใช้ (username)</label>
        <input name="username" required className="input mt-1" />
      </div>
      <div>
        <label className="text-sm font-medium">รหัสผ่าน (อย่างน้อย 6 ตัว)</label>
        <input name="password" type="password" required minLength={6} className="input mt-1" />
      </div>
      {searchParams.error && <p className="text-sm text-red-600">{searchParams.error}</p>}
      <button className="btn-primary w-full">สมัคร</button>
      <p className="text-sm text-center text-black/60">
        มีบัญชีแล้ว? <Link href="/login" className="text-brand-700 hover:underline">เข้าสู่ระบบ</Link>
      </p>
    </form>
  );
}
