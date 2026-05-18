# TaskFlow — ระบบจัดการงานองค์กร

แอปพลิเคชันเว็บสำหรับจัดการ task ในองค์กร แยกตามทีม / โปรเจกต์ / ผู้รับผิดชอบ พร้อมระบบสิทธิ์, real-time sync, และ export รายงาน

---

## 🚀 Deployment

- **Frontend:** [Vercel](https://vercel.com/) — Next.js 14 (App Router) deploy อัตโนมัติจาก GitHub
- **Backend / Database:** [Supabase](https://supabase.com/) — Postgres + Auth + Realtime + Row Level Security
- **Domain auth:** ใช้ synthetic email pattern `<username>@taskflow.app` กับ Supabase Auth

---

## 🛠️ Tech Stack

| Layer | Tools |
|---|---|
| **Framework** | Next.js 14 (App Router, Server Actions, TypeScript) |
| **Styling** | Tailwind CSS — theme น้ำเงิน/ขาว/ดำ |
| **Database** | Supabase Postgres + Row Level Security (RLS) |
| **Auth** | Supabase Auth (email+password ผ่าน synthetic email) |
| **Realtime** | Supabase Realtime (`postgres_changes` channels) |
| **Client state** | `@tanstack/react-query` |
| **Drag & drop** | `@dnd-kit/core` (drag task ข้าม column เพื่อเปลี่ยน status) |
| **CSV export** | `papaparse` (server route handlers + UTF-8 BOM) |
| **Form / validation** | `react-hook-form` + `zod` |

---

## 🏗️ โครงสร้าง / Flow หลัก

### Auth Flow
```
User กรอก username + password
     ↓
แปลงเป็น <username>@taskflow.app
     ↓
Supabase Auth (admin.createUser ฝั่ง register, signInWithPassword ฝั่ง login)
     ↓
trigger handle_new_user สร้าง row ใน public.profiles (role='worker')
     ↓
Middleware redirect ถ้ายังไม่ login
```

### Permission Model (2 ชั้น)
```
Global role: root_admin / admin / team_lead / worker  (profiles.role)
                            +
Per-team role: lead / member  (team_members.role_in_team)
```
**กฎการอนุญาต:**
```
canManage = isAdminOrAbove(globalRole)
         || my role_in_team in this team === 'lead'
```
- Worker ทั่วไป → เห็น task ของตัวเอง, อัปเดต status ของตัวเองได้
- Member ในทีม → ดูทุก task ในทีม, ไม่สามารถมอบหมาย/แก้ task ของคนอื่น
- Lead ในทีม → ทำได้ทุกอย่างในทีมนั้น
- Admin → ทำได้ทุกอย่างในทุกทีม + กำหนด role
- Root Admin → สิทธิ์สูงสุด + เป็น lead ทุกทีมโดยอัตโนมัติ (DB trigger บังคับ)

### Defense in Depth (ความปลอดภัย 3 ชั้น)
```
[1] UI Gate    — ซ่อนปุ่ม/dropdown ถ้าไม่มีสิทธิ์
       ↓
[2] Server     — assertActorIsLead() ใน server action ตรวจซ้ำ
   Action
       ↓
[3] DB RLS     — Postgres policy ใช้ helper is_team_lead(), is_admin_or_above()
```
แม้ user จะ bypass UI ส่ง request ตรงไป API ก็ยังโดน server action ปฏิเสธ และถ้า bypass server ได้ DB ก็ปฏิเสธอีกชั้น

### Real-time Sync (2 patterns)
1. **TaskBoard (client component)** — subscribe Supabase channel ต่อ project → invalidate React Query → re-fetch
2. **RealtimeRefresher (ฝังในหน้า server)** — subscribe → debounce 250ms → `router.refresh()` ให้ Next.js fetch ใหม่

### Activity Log (อัตโนมัติจาก DB trigger)
ทุกการ INSERT / UPDATE / DELETE บน `tasks` และ `task_assignees` ถูก trigger ใน Postgres เขียน log ลง `activity_logs` อัตโนมัติ — ไม่ต้องเขียน `INSERT log` ใน TypeScript

### Feature Matrix
| Feature | Implementation |
|---|---|
| Login / Register | Server Actions + Supabase Auth (synthetic email) |
| Role management | UI dropdown + server action + RLS |
| Team / Project CRUD | Server Actions + RLS |
| Invite Code 6 หลัก | `crypto.randomInt`, expires 24h, ใช้แล้ว lock |
| Task Kanban + drag | `@dnd-kit/core`, status change via drag, assign via picker |
| Filter (All/TODO/DOING/DONE/LATE) | Client-side filter ใน TaskBoard |
| Dashboard stats + progress | Server component + RealtimeRefresher |
| CSV Export | Route handler + `papaparse` + UTF-8 BOM |
| Activity Log | DB trigger + server fetch + CSV export |
| Real-time across tabs | Supabase Realtime + React Query invalidate / router.refresh |

---

## 📖 คู่มือผู้ใช้

### เริ่มต้นใช้งาน
1. **สมัครสมาชิก** — กรอก username (a-z, 0-9, _ . -) + รหัสผ่าน (อย่างน้อย 6 ตัว) → เข้าระบบอัตโนมัติ
2. **เข้าสู่ระบบ** — กรอก username + รหัสผ่าน

> ผู้ใช้ใหม่เริ่มเป็น **Worker** — ต้องให้ Admin หรือ Team Lead เพิ่มเข้าทีมก่อนถึงจะใช้งานได้

### ระดับสิทธิ์ (Role)

| สิทธิ์ | หน้าที่ |
|---|---|
| **Root Admin** | สิทธิ์สูงสุด ตั้ง/ยกเลิก Admin, มีคนเดียว, เป็น lead ทุกทีมอัตโนมัติ |
| **Admin** | กำหนด role คนอื่น, ดู overview ทุกทีม/โปรเจกต์, สิทธิ์เทียบเท่า Lead ทุกทีม |
| **Team Lead** | สร้าง/ลบทีม, สร้าง/ลบโปรเจกต์, เชิญสมาชิก, จัดการ task |
| **Worker** | ดู task ตัวเอง, อัปเดต status ของงานตัวเองได้ |

**ระดับในทีม (แยกจาก role หลัก):**
- **Lead** — แก้ทุกอย่างในทีมนั้น
- **Member** — ดู + อัปเดต status งานตัวเอง แต่แก้ assignee คนอื่นไม่ได้

### ฟีเจอร์หลัก

**Dashboard** — สรุป TODO/DOING/DONE/Late/Total พร้อม progress bar, อัปเดต real-time

**Teams**
- สร้างทีม / แก้ไขชื่อ (กดปุ่ม ✏️) / ลบทีม (มี confirm)
- เชิญสมาชิก 2 วิธี: **Invite Code 6 หลัก** (หมดอายุ 24 ชม.) หรือ **เชิญด้วย username**
- จัดการ role ในทีม (lead ↔ member) ผ่าน dropdown

**Projects**
- สร้าง/แก้/ลบ project
- แต่ละ project มี progress bar

**Task Board (Kanban)**
- 3 column: **TODO** (ฟ้า) / **DOING** (เหลือง) / **DONE** (เขียว)
- งานเลย deadline แต่ยังไม่ DONE → **สีแดง LATE**
- **Drag task ข้าม column** เพื่อเปลี่ยน status
- ปุ่ม **+ Add worker** มอบหมายคน
- Filter: ALL / TODO / DOING / DONE / LATE
- Export CSV ตามสถานะ + ช่วงวันที่ที่เลือก

**Activity Log** (Lead+)
- ดูประวัติทุกการเปลี่ยนแปลงใน project
- Export CSV ได้

**เมนู Admin**
- `/admin/users` — กำหนด role ผู้ใช้
- `/admin/overview` — ภาพรวมทุก team/project พร้อม stats

### Real-time Sync
ทุกการเปลี่ยนแปลงอัปเดตอัตโนมัติทุก tab/อุปกรณ์ภายใน ~1 วินาที — ไม่ต้องกด refresh

---

## 🎨 สี / สัญลักษณ์

| สี | ความหมาย |
|---|---|
| 🔵 ฟ้า | TODO |
| 🟡 เหลือง | DOING |
| 🟢 เขียว | DONE |
| 🔴 แดง | LATE (เลย deadline) |
| ⚫ ดำ | Root Admin badge |

---

## ❓ FAQ

**ลืมรหัสผ่าน?** → แจ้ง Admin หรือ Root Admin ขององค์กรเพื่อ reset

**Dashboard ว่างเปล่า?** → ยังไม่ได้อยู่ทีมไหน — ติดต่อ Team Lead เพื่อขอ Invite Code

**Worker เปลี่ยน status งานตัวเองได้ไหม?** → ได้ เฉพาะ task ที่ตัวเองถูก assign

**แก้ status งานคนอื่นไม่ได้?** → ใช่ — ต้องเป็น Lead ของทีมถึงจะแก้ของคนอื่นได้

**Invite Code ใช้ซ้ำได้ไหม?** → ไม่ได้, 1 code = 1 ครั้ง, หมดอายุ 24 ชม.

**ลบ task แล้วเรียกคืนได้ไหม?** → ไม่ได้ แต่ Activity Log บันทึกการลบไว้ Lead สามารถสร้างใหม่ตามข้อมูลใน log

---

*Developed by Pheerawit — วางแผนโครงสร้าง / ออกแบบ / debug ด้วยตัวเอง, พัฒนาระบบด้วย AI*
