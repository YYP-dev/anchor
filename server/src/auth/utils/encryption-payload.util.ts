export interface EncryptionPayload {
  dekPasswordWrapped: string;
  dekRecoveryWrapped: string;
  passwordKdfSalt: string;
  recoveryKdfSalt: string;
}

export function buildEncryptionPayload(user: {
  dekPasswordWrapped: string | null;
  dekRecoveryWrapped: string | null;
  passwordKdfSalt: string | null;
  recoveryKdfSalt: string | null;
}): EncryptionPayload | undefined {
  if (
    !user.dekPasswordWrapped ||
    !user.dekRecoveryWrapped ||
    !user.passwordKdfSalt ||
    !user.recoveryKdfSalt
  ) {
    return undefined;
  }
  return {
    dekPasswordWrapped: user.dekPasswordWrapped,
    dekRecoveryWrapped: user.dekRecoveryWrapped,
    passwordKdfSalt: user.passwordKdfSalt,
    recoveryKdfSalt: user.recoveryKdfSalt,
  };
}
