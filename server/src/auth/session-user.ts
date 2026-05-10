import type { UserStatus } from '../generated/prisma/enums';
import type { EncryptionPayload } from './utils/encryption-payload.util';

/** JWT/session shape returned by JwtStrategy and auth endpoints */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  profileImage: string | null;
  isAdmin: boolean;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
  encryption?: EncryptionPayload;
}
