"use client";

import { useTransition } from "react";
import { deleteCannedResponseAction } from "./actions";

export default function CannedResponseRow({
  id,
  projectName,
  title,
  body,
  createdBy,
}: {
  id: string;
  projectName: string;
  title: string;
  body: string;
  createdBy: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <tr className="border-b border-border last:border-0">
      <td className="p-3">{projectName}</td>
      <td className="p-3 font-bold">{title}</td>
      <td className="max-w-[320px] truncate p-3">{body}</td>
      <td className="p-3">{createdBy}</td>
      <td className="p-3">
        <button
          type="button"
          disabled={isPending}
          className="btn btn-outline text-xs"
          onClick={() => {
            if (confirm("هل تريد حذف هذا الرد الجاهز؟")) {
              startTransition(() => deleteCannedResponseAction(id));
            }
          }}
        >
          حذف
        </button>
      </td>
    </tr>
  );
}
