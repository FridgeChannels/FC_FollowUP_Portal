import type { Metadata } from "next";
import OutreachApp from "../outreach-workspace";
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

export default function WorkspaceRoute() {
  return <OutreachApp />;
}
