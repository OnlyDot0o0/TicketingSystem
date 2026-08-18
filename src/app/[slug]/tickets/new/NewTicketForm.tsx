"use client";

import Script from "next/script";
import { useFormState, useFormStatus } from "react-dom";
import { createTicketAction, CreateTicketState } from "./actions";
import { PRIORITY_LABELS } from "@/lib/config";
import type { TicketFormConfig } from "@/lib/projects";
import type { CaptchaConfig } from "@/lib/captcha";
import { parseOptions } from "@/lib/customFields";

const initialState: CreateTicketState = {};

type CustomFieldConfig = {
  id: string;
  key: string;
  label: string;
  fieldType: string;
  required: boolean;
  options: string | null;
};

function CustomFieldInput({ field }: { field: CustomFieldConfig }) {
  const name = `cf_${field.key}`;
  const label = `${field.label} ${field.required ? "*" : "(اختياري)"}`;

  if (field.fieldType === "TEXTAREA") {
    return (
      <div className="sm:col-span-2">
        <label className="label" htmlFor={name}>{label}</label>
        <textarea id={name} name={name} rows={4} required={field.required} className="field" />
      </div>
    );
  }
  if (field.fieldType === "SELECT") {
    const options = parseOptions(field.options);
    return (
      <div>
        <label className="label" htmlFor={name}>{label}</label>
        <select id={name} name={name} required={field.required} className="field" defaultValue="">
          <option value="" disabled={field.required}>بدون تحديد</option>
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>
    );
  }
  if (field.fieldType === "CHECKBOX") {
    return (
      <div className="flex items-center gap-2">
        <input id={name} name={name} type="checkbox" value="true" />
        <label htmlFor={name} className="text-sm">{field.label}</label>
      </div>
    );
  }
  if (field.fieldType === "NUMBER") {
    return (
      <div>
        <label className="label" htmlFor={name}>{label}</label>
        <input id={name} name={name} type="number" required={field.required} className="field" dir="ltr" />
      </div>
    );
  }
  if (field.fieldType === "DATE") {
    return (
      <div>
        <label className="label" htmlFor={name}>{label}</label>
        <input id={name} name={name} type="date" required={field.required} className="field" dir="ltr" />
      </div>
    );
  }
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} type="text" required={field.required} className="field" />
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-accent w-full sm:w-auto">
      {pending ? "جارٍ الإرسال..." : "إرسال التذكرة"}
    </button>
  );
}

export default function NewTicketForm({
  slug,
  config,
  captcha,
  categories,
  customFields,
}: {
  slug: string;
  config: TicketFormConfig;
  captcha: CaptchaConfig;
  categories: { key: string; label: string }[];
  customFields: CustomFieldConfig[];
}) {
  const [state, formAction] = useFormState(createTicketAction.bind(null, slug), initialState);

  return (
    <form action={formAction} encType="multipart/form-data" className="card space-y-5 p-6">
      {/* Honeypot — real users never see or fill this. Bots that auto-fill
          every field usually do; the server silently rejects if it's non-empty. */}
      <div
        aria-hidden="true"
        style={{ position: "absolute", left: "-9999px", top: "-9999px", opacity: 0, height: 0, overflow: "hidden" }}
      >
        <label htmlFor="website">اتركه فارغًا</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {state?.error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="submitterName">الاسم *</label>
          <input required id="submitterName" name="submitterName" className="field" />
        </div>
        <div>
          <label className="label" htmlFor="submitterPhone">رقم الجوال *</label>
          <input required id="submitterPhone" name="submitterPhone" className="field" dir="ltr" placeholder="05xxxxxxxx" />
        </div>

        {config.emailMode !== "HIDDEN" && (
          <div>
            <label className="label" htmlFor="submitterEmail">
              البريد الإلكتروني {config.emailMode === "REQUIRED" ? "*" : "(اختياري)"}
            </label>
            <input
              id="submitterEmail"
              name="submitterEmail"
              type="email"
              required={config.emailMode === "REQUIRED"}
              className="field"
              dir="ltr"
            />
          </div>
        )}

        {config.contractNumberMode !== "HIDDEN" && (
          <div>
            <label className="label" htmlFor="contractNumber">
              رقم العقد {config.contractNumberMode === "REQUIRED" ? "*" : "(اختياري)"}
            </label>
            <input
              id="contractNumber"
              name="contractNumber"
              required={config.contractNumberMode === "REQUIRED"}
              className="field"
              dir="ltr"
            />
          </div>
        )}

        <div>
          <label className="label" htmlFor="category">
            التصنيف {config.categoryMode === "REQUIRED" ? "*" : "(اختياري)"}
          </label>
          <select
            required={config.categoryMode === "REQUIRED"}
            id="category"
            name="category"
            className="field"
            defaultValue={config.categoryMode === "REQUIRED" ? categories[0]?.key ?? "" : ""}
          >
            {config.categoryMode !== "REQUIRED" && <option value="">بدون تحديد</option>}
            {categories.map(({ key, label }) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="priority">
            الأولوية {config.priorityMode === "REQUIRED" ? "*" : "(اختياري)"}
          </label>
          <select
            required={config.priorityMode === "REQUIRED"}
            id="priority"
            name="priority"
            className="field"
            defaultValue={config.priorityMode === "REQUIRED" ? "MEDIUM" : ""}
          >
            {config.priorityMode !== "REQUIRED" && <option value="">بدون تحديد</option>}
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="subject">عنوان المشكلة *</label>
        <input required id="subject" name="subject" className="field" />
      </div>

      <div>
        <label className="label" htmlFor="description">وصف المشكلة *</label>
        <textarea required id="description" name="description" rows={6} className="field" />
      </div>

      {customFields.length > 0 && (
        <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
          {customFields.map((f) => (
            <CustomFieldInput key={f.id} field={f} />
          ))}
        </div>
      )}

      {config.attachmentsMode !== "HIDDEN" && (
        <div>
          <label className="label" htmlFor="attachments">
            المرفقات {config.attachmentsMode === "REQUIRED" ? "* " : "(اختياري) "}
            (صور أو PDF، حتى 8 ميجابايت لكل ملف)
          </label>
          <input
            id="attachments"
            name="attachments"
            type="file"
            multiple
            required={config.attachmentsMode === "REQUIRED"}
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="field"
          />
        </div>
      )}

      {captcha?.provider === "hcaptcha" && (
        <>
          <Script src="https://js.hcaptcha.com/1/api.js" async defer />
          <div className="h-captcha" data-sitekey={captcha.siteKey} />
        </>
      )}
      {captcha?.provider === "recaptcha" && (
        <>
          <Script src="https://www.google.com/recaptcha/api.js" async defer />
          <div className="g-recaptcha" data-sitekey={captcha.siteKey} />
        </>
      )}

      <SubmitButton />
    </form>
  );
}
