-- Persist direct school messages and per-recipient read receipts.
CREATE TABLE "school_messages" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "subject" VARCHAR(160) NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "school_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "school_message_recipients" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "school_message_recipients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "school_message_recipients_messageId_recipientId_key"
ON "school_message_recipients"("messageId", "recipientId");
CREATE INDEX "school_messages_schoolId_createdAt_idx"
ON "school_messages"("schoolId", "createdAt" DESC);
CREATE INDEX "school_messages_senderId_createdAt_idx"
ON "school_messages"("senderId", "createdAt" DESC);
CREATE INDEX "school_message_recipients_recipientId_isRead_idx"
ON "school_message_recipients"("recipientId", "isRead");
CREATE INDEX "school_message_recipients_messageId_idx"
ON "school_message_recipients"("messageId");

ALTER TABLE "school_messages"
ADD CONSTRAINT "school_messages_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "school_messages"
ADD CONSTRAINT "school_messages_senderId_fkey"
FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "school_message_recipients"
ADD CONSTRAINT "school_message_recipients_messageId_fkey"
FOREIGN KEY ("messageId") REFERENCES "school_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "school_message_recipients"
ADD CONSTRAINT "school_message_recipients_recipientId_fkey"
FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
