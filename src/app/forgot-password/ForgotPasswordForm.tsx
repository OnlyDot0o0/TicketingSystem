"use client";

import { useFormState, useFormStatus } from "react-dom";
import { forgotPasswordAction, ForgotPasswordState } from "./actions";

const initialState: ForgotPasswordState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary w-full">
      {pending ? "جارٍ الإرسال..." : "إرسال رابط إعادة التعيين"}
    </button>
  );
}

export default function ForgotPasswordForm() {
  const [state, formAction] = useFormState(forgotPasswordAction, initialState);

  if (state?.submitted) {
    return (
      <div className="card space-y-3 p-6 text-sm">
        <p className="text-ink">
          إذا كان هناك حساب مرتبط بهذا البريد الإلكتروني، فسيصلك رابط لإعادة تعيين كلمة
          المرور (صالح لمدة ساعة واحدة). إذا لم تصلك رسالة خلال دقائق، تحقق من مجلد
          الرسائل غير المرغوبة.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="card space-y-4 p-6">
      {state?.error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          {state.error}
        </div>
      )}
      <div>
        <label className="label" htmlFor="email">البريد الإلكتروني</label>
        <input id="email" name="email" type="email" dir="ltr" required className="field" />
      </div>
      <SubmitButton />
    </form>
  );
}
