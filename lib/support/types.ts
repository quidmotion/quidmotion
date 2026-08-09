export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string | null;
  senderRole: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

export type ChatConversation = {
  id: string;
  userId: string | null;
  guestName: string | null;
  guestEmail: string | null;
  status: string;
  assignedTo: string | null;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
  userName?: string | null;
  userEmail?: string | null;
  unreadCount?: number;
  lastPreview?: string | null;
};
