"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Loader2, Mail, Lock, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  completePasswordReset,
  forgotPassword,
  verifyPasswordResetOtp,
} from "@/features/auth/api";
import { useAuthStore } from "@/features/auth/store";
import {
  deriveKeyFromRecoverySecret,
  unwrapDek,
  deriveKeyFromPassword,
  wrapDek,
  storeDekFromCryptoKey,
  unlockVaultWithPassword,
} from "@/features/encryption";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type Step = "email" | "otp" | "password";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoveryJson, setRecoveryJson] = useState("");
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [encryption, setEncryption] = useState<
    | {
        dekRecoveryWrapped: string;
        recoveryKdfSalt: string;
        passwordKdfSalt: string;
      }
    | null
  >(null);

  const [busy, setBusy] = useState(false);

  const sendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await forgotPassword(email.trim());
      toast.success("If an account exists, a reset code was sent to your email.");
      setStep("otp");
    } catch {
      toast.error("Could not start password reset.");
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await verifyPasswordResetOtp(email.trim(), code.trim());
      setResetToken(res.resetToken);
      setEncryption(res.encryption);
      setStep("password");
      toast.success("Code verified. Set a new password and provide your recovery key file.");
    } catch {
      toast.error("Invalid or expired code.");
    } finally {
      setBusy(false);
    }
  };

  const finish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    if (!resetToken || !encryption) {
      toast.error("Reset session expired. Start again.");
      return;
    }

    let recoverySecret: string;
    try {
      const parsed = JSON.parse(recoveryJson) as { recoverySecret?: string };
      if (!parsed.recoverySecret || typeof parsed.recoverySecret !== "string") {
        throw new Error("bad file");
      }
      recoverySecret = parsed.recoverySecret;
    } catch {
      toast.error("Paste the full contents of your recovery key JSON file.");
      return;
    }

    setBusy(true);
    try {
      const recKek = await deriveKeyFromRecoverySecret(
        recoverySecret,
        encryption.recoveryKdfSalt,
      );
      const dek = await unwrapDek(encryption.dekRecoveryWrapped, recKek);
      const pwKek = await deriveKeyFromPassword(newPassword, encryption.passwordKdfSalt);
      const newDekPasswordWrapped = await wrapDek(dek, pwKek);

      const auth = await completePasswordReset({
        resetToken,
        newPassword,
        newDekPasswordWrapped,
      });

      if (!auth.access_token || !auth.refresh_token || !auth.user) {
        toast.error("Reset incomplete.");
        return;
      }

      setAuth(auth.user, auth.access_token, auth.refresh_token);

      if (auth.user.encryption) {
        try {
          const dekUnwrapped = await unlockVaultWithPassword(
            newPassword,
            auth.user.encryption,
          );
          await storeDekFromCryptoKey(dekUnwrapped);
        } catch {
          toast.message("Signed in—use the unlock banner if encrypted notes stay locked.");
        }
      }

      toast.success("Password updated. You are signed in.");
      router.push("/");
    } catch {
      toast.error("Could not complete reset. Check your recovery file and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-0 shadow-xl bg-card/80 backdrop-blur-sm overflow-hidden max-w-md w-full">
      <CardHeader className="space-y-4 text-center pb-2">
        <div className="mx-auto flex items-center justify-center">
          <Image src="/icons/anchor_icon.png" alt="Anchor" width={56} height={56} />
        </div>
        <div className="space-y-1">
          <CardTitle className="text-2xl font-serif">Reset password</CardTitle>
          <CardDescription className="text-muted-foreground">
            {step === "email" && "We email you a one-time code."}
            {step === "otp" && "Enter the code from your email."}
            {step === "password" &&
              "Choose a new password and paste your recovery key JSON so encrypted notes keep working."}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-2">
        {step === "email" && (
          <form onSubmit={sendEmail} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-12 bg-background/50"
                  placeholder="you@example.com"
                />
              </div>
            </div>
            <Button type="submit" className="w-full h-12" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send code"}
            </Button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={verifyOtp} className="space-y-4">
            <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Code sent to <span className="text-foreground font-medium">{email}</span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">One-time code</Label>
              <Input
                id="code"
                inputMode="numeric"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="h-12 tracking-widest text-center text-lg bg-background/50"
                placeholder="••••••"
              />
            </div>
            <Button type="submit" className="w-full h-12" disabled={busy || code.length !== 6}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify code"}
            </Button>
          </form>
        )}

        {step === "password" && (
          <form onSubmit={finish} className="space-y-4">
            <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-3 text-xs text-muted-foreground leading-relaxed space-y-2">
              <div className="flex items-center gap-2 font-medium text-foreground text-sm">
                <KeyRound className="h-4 w-4 shrink-0" />
                Recovery key required
              </div>
              <p>
                Open the <code className="text-foreground">anchor-recovery-*.json</code> file you saved at
                registration and paste its full contents below. Without the correct recovery secret, your new password
                will work—but encrypted notes cannot be opened.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="recovery">Recovery key file (JSON)</Label>
              <textarea
                id="recovery"
                required
                rows={5}
                value={recoveryJson}
                onChange={(e) => setRecoveryJson(e.target.value)}
                className="w-full rounded-md border border-input bg-background/80 px-3 py-2 text-xs font-mono"
                placeholder='{"version":1,"recoverySecret":"..."}'
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="np">New password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="np"
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pl-10 h-12 bg-background/50"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cp">Confirm new password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="cp"
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10 h-12 bg-background/50"
                />
              </div>
            </div>

            <Button type="submit" className="w-full h-12" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reset password & sign in"}
            </Button>
          </form>
        )}

        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-accent hover:text-accent/80">
            Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
