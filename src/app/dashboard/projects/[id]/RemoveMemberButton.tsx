"use client";

import { useTransition } from "react";
import { removeProjectMemberAction } from "../actions";

export default function RemoveMemberButton({ projectId, userId }: { projectId: string; userId: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={isPending}
      className="btn btn-outline text-xs"
      onClick={() => {
        if (confirm("هل تريد إزالة هذا العضو من فريق المشروع؟")) {
          startTransition(() => removeProjectMemberAction(projectId, userId));
        }
      }}
    >
      إزالة
    </button>
  );
}
