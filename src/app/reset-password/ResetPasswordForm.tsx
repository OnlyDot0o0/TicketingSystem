"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { resetPasswordAction, ResetPasswordState } from "./actions";

const initialState: ResetPasswordState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary w-full">
      {pending ? "جارٍ الحفظ..." : "تعيين كلمة المرور الجديدة"}
    </button>
  );
}

export default function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction] = useFormState(resetPasswordAction, initialState);

  if (state?.success) {
    return (
      <div className="card space-y-3 p-6 text-sm">
        <p className="text-ink">تم تعيين كلمة المرور الجديدة بنجاح.</p>
        <Link href="/login" className="btn btn-primary block text-center">تسجيل الدخول</Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="card space-y-4 p-6">
      <input type="hidden" name="token" value={token} />
      {state?.error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          {state.error}
        </div>
      )}
      <div>
        <label className="label" htmlFor="password">كلمة المرور الجديدة</label>
        <input id="password" name="password" type="password" dir="ltr" required minLength={8} className="field" />
      </div>
      <div>
        <label className="label" htmlFor="confirmPassword">تأكيد كلمة المرور</label>
        <input id="confirmPassword" name="confirmPassword" type="password" dir="ltr" required minLength={8} className="field" />
      </div>
      <SubmitButton />
    </form>
  );
}
