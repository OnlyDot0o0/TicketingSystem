"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { loginAction, LoginState } from "./actions";

const initialState: LoginState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary w-full">
      {pending ? "جارٍ الدخول..." : "دخول"}
    </button>
  );
}

export default function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, formAction] = useFormState(loginAction, initialState);

  return (
    <form action={formAction} className="card space-y-4 p-6">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      {state?.error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          {state.error}
        </div>
      )}
      <div>
        <label className="label" htmlFor="email">البريد الإلكتروني</label>
        <input id="email" name="email" type="email" dir="ltr" required className="field" />
      </div>
      <div>
        <label className="label" htmlFor="password">كلمة المرور</label>
        <input id="password" name="password" type="password" dir="ltr" required className="field" />
      </div>
      <SubmitButton />
      <div className="text-center">
        <Link href="/forgot-password" className="text-xs text-ink-soft hover:text-teal">
          نسيت كلمة المرور؟
        </Link>
      </div>
    </form>
  );
}
