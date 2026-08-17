"use client";

import { useState, useTransition } from "react";
import { generateTotpSecretAction, confirmTotpEnrollmentAction, disableTotpAction } from "./actions";

export default function TotpSettings({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [enrollment, setEnrollment] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [disableError, setDisableError] = useState<string | null>(null);

  function handleGenerate() {
    setGenerateError(null);
    startTransition(async () => {
      const result = await generateTotpSecretAction();
      if (result.error) setGenerateError(result.error);
      else if (result.secret && result.qrDataUrl) setEnrollment({ secret: result.secret, qrDataUrl: result.qrDataUrl });
    });
  }

  function handleConfirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setConfirmError(null);
    const code = String(new FormData(e.currentTarget).get("code") || "");
    startTransition(async () => {
      const result = await confirmTotpEnrollmentAction(code);
      if (result.error) setConfirmError(result.error);
      else if (result.success) {
        setEnabled(true);
        setEnrollment(null);
      }
    });
  }

  function handleDisable(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setDisableError(null);
    const password = String(new FormData(e.currentTarget).get("currentPassword") || "");
    startTransition(async () => {
      const result = await disableTotpAction(password);
      if (result.error) setDisableError(result.error);
      else if (result.success) setEnabled(false);
    });
  }

  if (enabled) {
    return (
      <div className="card space-y-3 p-5">
        <p className="text-sm text-ink">
          الحالة: <span className="font-bold text-teal">مفعّلة ✓</span>
        </p>
        <p className="text-xs text-ink-soft">
          لتعطيل المصادقة الثنائية، أدخل كلمة المرور الحالية لتأكيد أنك صاحب الحساب.
        </p>
        <form onSubmit={handleDisable} className="space-y-3">
          {disableError && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700">{disableError}</div>
          )}
          <div className="max-w-xs">
            <label className="label" htmlFor="currentPassword">كلمة المرور الحالية</label>
            <input id="currentPassword" name="currentPassword" type="password" dir="ltr" required className="field" />
          </div>
          <button type="submit" disabled={isPending} className="btn btn-outline text-sm text-red-700">
            {isPending ? "جارٍ التعطيل..." : "تعطيل المصادقة الثنائية"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="card space-y-3 p-5">
      <p className="text-sm text-ink">
        الحالة: <span className="font-bold text-ink-soft">غير مفعّلة</span>
      </p>
      <p className="text-xs text-ink-soft">
        تعمل المصادقة الثنائية (TOTP) مع أي تطبيق مصادقة قياسي مثل Google Authenticator أو Authy — لا حاجة
        لأي خدمة خارجية.
      </p>

      {!enrollment && (
        <button type="button" disabled={isPending} onClick={handleGenerate} className="btn btn-accent text-sm">
          {isPending ? "جارٍ الإنشاء..." : "تفعيل المصادقة الثنائية"}
        </button>
      )}
      {generateError && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700">{generateError}</div>
      )}

      {enrollment && (
        <div className="space-y-3 border-t border-border pt-3">
          <p className="text-sm text-ink">امسح الرمز التالي بتطبيق المصادقة، أو أدخل الرمز يدويًا:</p>
          {/* Server-rendered data: URI (src/lib/totp.ts) — a plain <img> is
              fine here, next/image doesn't add value for a one-off data URI. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enrollment.qrDataUrl} alt="رمز QR للمصادقة الثنائية" className="h-40 w-40" />
          <p className="text-xs text-ink-soft">
            الرمز اليدوي: <span className="font-mono font-bold text-ink" dir="ltr">{enrollment.secret}</span>
          </p>
          <form onSubmit={handleConfirm} className="space-y-2">
            {confirmError && (
              <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700">{confirmError}</div>
            )}
            <div className="max-w-xs">
              <label className="label" htmlFor="code">أدخل الرمز المكوّن من 6 أرقام لتأكيد التفعيل</label>
              <input
                id="code"
                name="code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                dir="ltr"
                required
                className="field"
                placeholder="123456"
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={isPending} className="btn btn-primary text-sm">
                {isPending ? "جارٍ التحقق..." : "تأكيد التفعيل"}
              </button>
              <button type="button" className="btn btn-outline text-sm" onClick={() => setEnrollment(null)}>
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
