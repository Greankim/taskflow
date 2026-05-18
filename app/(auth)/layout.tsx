export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-800 via-brand-700 to-black px-4">
      <div className="w-full max-w-md card p-8">
        <h1 className="text-2xl font-bold text-brand-800 mb-1">TaskFlow</h1>
        <p className="text-sm text-black/60 mb-6">ระบบจัดการงานองค์กร</p>
        {children}
      </div>
    </div>
  );
}
