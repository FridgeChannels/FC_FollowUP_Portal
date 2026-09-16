import type { Metadata } from "next";
import { workspaceMetadata } from "@/lib/page-metadata";

type Props = {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const { path } = await params;
  return workspaceMetadata(path, await searchParams);
}

/** Content is rendered by the portal layout shell to keep the sidebar mounted. */
export default function WorkspaceRoute() {
  return null;
}
