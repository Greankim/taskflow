import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { usernameToEmail } from "@/lib/utils";

async function loginAction(formData: FormData) {
  "use server";
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");
  if (!username || !password) return redirect("/login?error=missing");
  const supabase = createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });
  if (error) return redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect("/dashboard");
}

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <form action={loginAction} className="space-y-4">
      <h2 className="text-lg font-semibold">เข้าสู่ระบบ</h2>
      <div>
        <label className="text-sm font-medium">ชื่อผู้ใช้</label>
        <input name="username" required className="input mt-1" autoComplete="username" />
      </div>
      <div>
        <label className="text-sm font-medium">รหัสผ่าน</label>
        <input name="password" type="password" required className="input mt-1" autoComplete="current-password" />
      </div>
      {searchParams.error && <p className="text-sm text-red-600">{searchParams.error}</p>}
      <button className="btn-primary w-full">เข้าสู่ระบบ</button>
      <p className="text-sm text-center text-black/60">
        ยังไม่มีบัญชี? <Link href="/register" className="text-brand-700 hover:underline">สมัครสมาชิก</Link>
      </p>
    </form>
  );
}
