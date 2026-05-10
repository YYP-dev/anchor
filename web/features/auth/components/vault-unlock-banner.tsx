"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/hooks/use-auth";
import {
  isVaultSessionUnlocked,
  storeDekFromCryptoKey,
  unlockVaultWithPassword,
} from "@/features/encryption";
import { toast } from "sonner";

export function VaultUnlockBanner() {
  const { user } = useAuth();
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const enc = user?.encryption;
    setShow(!!enc && !isVaultSessionUnlocked());
  }, [user?.encryption, user?.id]);

  if (!show || !user?.encryption) {
    return null;
  }

  const onUnlock = async () => {
    if (!password.trim()) {
      toast.error("Enter your account password to unlock encrypted notes.");
      return;
    }
    setPending(true);
    try {
      const dek = await unlockVaultWithPassword(password, user.encryption!);
      await storeDekFromCryptoKey(dek);
      setPassword("");
      setShow(false);
      toast.success("Encrypted notes unlocked for this browser session.");
      window.dispatchEvent(new Event("anchor:vault-unlocked"));
    } catch {
      toast.error("Could not unlock the vault. Check your password and try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      role="region"
      aria-label="Unlock encrypted notes"
      className="border-b border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-foreground"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-medium text-foreground">Encrypted notes are locked</p>
            <p className="mt-1 text-muted-foreground leading-snug">
              Your recovery key secures password resets; your account password unlocks the same
              encryption key for this session. Enter your password to read or create encrypted notes.
            </p>
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Input
            type="password"
            autoComplete="current-password"
            placeholder="Account password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-10 sm:w-56 bg-background/80"
            onKeyDown={(e) => {
              if (e.key === "Enter") void onUnlock();
            }}
          />
          <Button
            type="button"
            size="sm"
            className="h-10 shrink-0"
            disabled={pending}
            onClick={() => void onUnlock()}
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Unlocking…
              </>
            ) : (
              "Unlock"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
