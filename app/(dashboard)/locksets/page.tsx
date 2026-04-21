import { redirect } from "next/navigation";

// Brand Locksets are managed per-client at /clients/[id]/lockset.
// This redirect handles sidebar navigation and any bookmarked /locksets links.
export default function LocksetIndexPage() {
  redirect("/clients");
}
