"use client";

import { useActionState, useRef, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { updateAccountInfoAction, AccountInfoState } from "./actions";

const initialState: AccountInfoState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary text-sm">
      {pending ? "جارٍ الحفظ..." : "حفظ التغييرات"}
    </button>
  );
}

export default function AccountInfoForm({
  initialName,
  initialEmail,
  roleLabel,
}: {
  initialName: string;
  initialEmail: string;
  roleLabel: string;
}) {
  const [state, formAction] = useActionState(updateAccountInfoAction, initialState);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Clear the current-password field after every submit attempt (success
  // or failure) — it's a confirmation value, not something that should
  // linger in the DOM once the request round-trips.
  useEffect(() => {
    if (passwordRef.current) passwordRef.current.value = "";
  }, [state]);

  return (
    <form action={formAction} className="card space-y-4 p-5">
      {state?.error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700">{state.error}</div>
      )}
      {state?.success && (
        <div className="rounded-lg border border-teal/30 bg-teal/10 p-2 text-sm text-teal">تم حفظ التغييرات بنجاح.</div>
      )}

      <div>
        <span className="label">الدور</span>
        <p className="text-sm text-ink-soft">{roleLabel}</p>
      </div>

      <div>
        <label className="label" htmlFor="name">الاسم</label>
        <input id="name" name="name" defaultValue={initialName} required className="field" />
      </div>

      <div>
        <label className="label" htmlFor="email">البريد الإلكتروني</label>
        <input id="email" name="email" type="email" dir="ltr" defaultValue={initialEmail} required className="field" />
        <p className="mt-1 text-xs text-ink-soft">
          هذا البريد هو ما تستخدمه لتسجيل الدخول — تغييره يعني استخدام البريد الجديد في المرة القادمة.
        </p>
      </div>

      <div className="max-w-xs">
        <label className="label" htmlFor="currentPassword">كلمة المرور الحالية (لتأكيد التغيير)</label>
        <input
          ref={passwordRef}
          id="currentPassword"
          name="currentPassword"
          type="password"
          dir="ltr"
          required
          className="field"
        />
      </div>

      <SubmitButton />
    </form>
  );
}
