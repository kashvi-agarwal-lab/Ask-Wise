import type { Metadata } from "next";
import Chat from "./chat";

export const metadata: Metadata = { title: "Chat — Bodywise Guide" };

export default function ChatPage() {
  return <Chat />;
}
