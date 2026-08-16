import type { Metadata } from "next";
import { getProjectBySlugOr404 } from "@/lib/projects";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const project = await getProjectBySlugOr404(params.slug);
  return {
    title: `${project.name} | نظام التذاكر`,
    description: `نظام تذاكر الدعم الفني لمشروع ${project.name}`,
  };
}

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  // Resolves the slug (404s if it doesn't match a project) and sets the
  // project's accent color as a CSS custom property on the wrapping element
  // so existing Tailwind classes that read `var(--accent)` pick it up —
  // the shared neutral background/ink/border palette stays the same across
  // all projects; only the accent hue changes per project.
  const project = await getProjectBySlugOr404(params.slug);

  return (
    <div style={{ ["--accent" as string]: project.accentColorHex }}>
      {children}
    </div>
  );
}
