"use client";
import { useRef, useTransition } from "react";

export function RoleSelect({
  action,
  hiddenFields,
  initialValue,
}: {
  action: (formData: FormData) => void | Promise<void>;
  hiddenFields: Record<string, string>;
  initialValue: "lead" | "member";
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form ref={formRef} action={(fd) => startTransition(() => action(fd) as any)}>
      {Object.entries(hiddenFields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <select
        name="role_in_team"
        defaultValue={initialValue}
        disabled={pending}
        onChange={() => formRef.current?.requestSubmit()}
        className={`input !py-1 text-xs !w-28 font-medium cursor-pointer
          ${initialValue === "lead" ? "!bg-brand-700 !text-white" : "!bg-brand-100 !text-brand-800"}`}
      >
        <option value="lead">lead</option>
        <option value="member">member</option>
      </select>
    </form>
  );
}
