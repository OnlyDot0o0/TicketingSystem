"use client";

import { useFormState, useFormStatus } from "react-dom";
import { submitterReplyAction, ReplyState } from "./actions";

const initialState: ReplyState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary">
      {pending ? "جارٍ الإرسال..." : "إرسال الرد"}
    </button>
  );
}

export default function ReplyForm({
  slug,
  ticketNumber,
  submitterPhone,
}: {
  slug: string;
  ticketNumber: string;
  submitterPhone: string;
}) {
  const [state, formAction] = useFormState(submitterReplyAction.bind(null, slug), initialState);

  return (
    <form action={formAction} encType="multipart/form-data" className="mt-4 space-y-3 border-t border-border pt-4">
      <input type="hidden" name="ticketNumber" value={ticketNumber} />
      <input type="hidden" name="submitterPhone" value={submitterPhone} />
      {state?.error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          {state.error}
        </div>
      )}
      <div>
        <label className="label" htmlFor="body">أضف ردًا</label>
        <textarea id="body" name="body" required rows={3} className="field" />
      </div>
      <div>
        <label className="label" htmlFor="attachments">مرفقات إضافية (اختياري)</label>
        <input
          id="attachments"
          name="attachments"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="field"
        />
      </div>
      <SubmitButton />
    </form>
  );
}
