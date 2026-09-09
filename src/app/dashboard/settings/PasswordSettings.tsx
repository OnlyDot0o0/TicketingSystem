"use client";

import { useActionState, useRef, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { changeOwnPasswordAction, ChangeOwnPasswordState } from "./actions";

const initialState: ChangeOwnPasswordState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary text-sm">
      {pending ? "جارٍ الحفظ..." : "تغيير كلمة المرور"}
    </button>
  );
}

export default function PasswordSettings() {
  const [state, formAction] = useActionState(changeOwnPasswordAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  // A successful change clears every field — unlike AccountInfoForm, there
  // is nothing left worth keeping visible (the new password shouldn't
  // linger in the DOM any more than the current one should).
  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="card space-y-4 p-5">
      {state?.error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700">{state.error}</div>
      )}
      {state?.success && (
        <div className="rounded-lg border border-teal/30 bg-teal/10 p-2 text-sm text-teal">تم تغيير كلمة المرور بنجاح.</div>
      )}

      <div className="max-w-xs">
        <label className="label" htmlFor="currentPassword">كلمة المرور الحالية</label>
        <input id="currentPassword" name="currentPassword" type="password" dir="ltr" required className="field" />
      </div>
      <div className="max-w-xs">
        <label className="label" htmlFor="newPassword">كلمة المرور الجديدة</label>
        <input id="newPassword" name="newPassword" type="password" dir="ltr" required minLength={8} className="field" />
      </div>
      <div className="max-w-xs">
        <label className="label" htmlFor="confirmPassword">تأكيد كلمة المرور الجديدة</label>
        <input id="confirmPassword" name="confirmPassword" type="password" dir="ltr" required minLength={8} className="field" />
      </div>

      <SubmitButton />
    </form>
  );
}
