import { ChatApp } from "@/components/chat-app";
import { getProfileSummary } from "@/lib/profile-summary";

export default function Home() {
  return <ChatApp profile={getProfileSummary()} />;
}
