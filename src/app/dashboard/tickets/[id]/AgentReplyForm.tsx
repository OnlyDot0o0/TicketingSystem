"use client";

import { useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { agentReplyAction, AgentReplyState } from "./actions";

const initialState: AgentReplyState = {};

type CannedResponse = { id: string; title: string; body: string };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary">
      {pending ? "جارٍ الإرسال..." : "إرسال"}
    </button>
  );
}

export default function AgentReplyForm({
  ticketId,
  cannedResponses,
}: {
  ticketId: string;
  cannedResponses: CannedResponse[];
}) {
  const [state, formAction] = useFormState(agentReplyAction, initialState);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function insertCanned(id: string) {
    const canned = cannedResponses.find((c) => c.id === id);
    if (!canned || !textareaRef.current) return;
    const el = textareaRef.current;
    // Still fully editable before sending — this only pre-fills the box.
    el.value = el.value ? `${el.value}\n\n${canned.body}` : canned.body;
    el.focus();
  }

  return (
    <form action={formAction} encType="multipart/form-data" className="mt-4 space-y-3 border-t border-border pt-4">
      <input type="hidden" name="ticketId" value={ticketId} />
      {state?.error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          {state.error}
        </div>
      )}
      {cannedResponses.length > 0 && (
        <div>
          <label className="label" htmlFor="cannedResponse">إدراج رد جاهز</label>
          <select
            id="cannedResponse"
            className="field"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                insertCanned(e.target.value);
                e.target.value = "";
              }
            }}
          >
            <option value="">اختر ردًا جاهزًا...</option>
            {cannedResponses.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="label" htmlFor="body">الرد</label>
        <textarea ref={textareaRef} id="body" name="body" required rows={3} className="field" />
      </div>
      <div>
        <label className="label" htmlFor="attachments">مرفقات (اختياري)</label>
        <input id="attachments" name="attachments" type="file" multiple className="field" />
      </div>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isInternalNote" />
          ملاحظة داخلية (لن تظهر لمقدّم الطلب)
        </label>
        <SubmitButton />
      </div>
    </form>
  );
}
