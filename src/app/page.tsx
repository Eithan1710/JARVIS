import { ChatApp } from "@/components/chat-app";
import { authRequired } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export default function Home() {
  return <ChatApp lockable={authRequired()} />;
}
