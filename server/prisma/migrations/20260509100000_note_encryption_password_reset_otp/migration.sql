-- AlterTable
ALTER TABLE "User" ADD COLUMN "dekPasswordWrapped" TEXT,
ADD COLUMN "dekRecoveryWrapped" TEXT,
ADD COLUMN "passwordKdfSalt" TEXT,
ADD COLUMN "recoveryKdfSalt" TEXT;

-- AlterTable
ALTER TABLE "Note" ADD COLUMN "isEncrypted" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PasswordResetOtp" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetOtp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PasswordResetOtp_email_idx" ON "PasswordResetOtp"("email");
