import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyPasswordResetOtpDto } from './dto/verify-password-reset-otp.dto';
import { CompletePasswordResetDto } from './dto/complete-password-reset.dto';
import { EmailService } from './email.service';
import { buildEncryptionPayload } from './utils/encryption-payload.util';
import type { SessionUser } from './session-user';
import { UserStatus } from '../generated/prisma/enums';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { generateApiToken } from './utils/generate-api-token';

const REFRESH_TOKEN_VALIDITY_DAYS = 90;

const AUTH_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  profileImage: true,
  isAdmin: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  dekPasswordWrapped: true,
  dekRecoveryWrapped: true,
  passwordKdfSalt: true,
  recoveryKdfSalt: true,
} as const;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private settingsService: SettingsService,
    private configService: ConfigService,
    private emailService: EmailService,
  ) { }

  async getRegistrationMode() {
    return {
      mode: await this.settingsService.getRegistrationMode(),
    };
  }

  async register(registerDto: RegisterDto) {
    const registrationMode = await this.settingsService.getRegistrationMode();

    if (registrationMode === 'disabled') {
      throw new ForbiddenException('Registration is disabled');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('User already exists');
    }

    this.validateRegistrationVault(registerDto);

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    // Check if this is the first user (no admins exist)
    const adminCount = await this.prisma.user.count({
      where: { isAdmin: true },
    });

    // Determine user status based on registration mode
    const userStatus =
      registrationMode === 'review' ? UserStatus.pending : UserStatus.active;

    const user = await this.prisma.user.create({
      data: {
        email: registerDto.email,
        password: hashedPassword,
        name: registerDto.name,
        isAdmin: adminCount === 0, // First user becomes admin
        status: userStatus,
        dekPasswordWrapped: registerDto.dekPasswordWrapped,
        dekRecoveryWrapped: registerDto.dekRecoveryWrapped,
        passwordKdfSalt: registerDto.passwordKdfSalt,
        recoveryKdfSalt: registerDto.recoveryKdfSalt,
      },
      select: AUTH_USER_SELECT,
    });

    const sessionUser = this.formatSessionUser(user);

    // Only return token if user is active (not pending)
    if (user.status === UserStatus.active) {
      const tokens = await this.createTokenPair(user.id, user.email);
      return {
        ...tokens,
        user: sessionUser,
      };
    }

    // Return without token for pending users
    return {
      user: sessionUser,
      message: 'Registration successful. Your account is pending approval.',
    };
  }

  async login(loginDto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
      select: { ...AUTH_USER_SELECT, password: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // OIDC users don't have passwords - they must use OIDC login
    if (!user.password) {
      throw new UnauthorizedException(
        'This account uses OIDC authentication. Please use the OIDC login option.',
      );
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user is pending approval
    if (user.status === UserStatus.pending) {
      throw new ForbiddenException(
        'Account pending approval. Please wait for an administrator to approve your account.',
      );
    }

    const { password: _, ...rest } = user;
    const sessionUser = this.formatSessionUser(rest);

    const tokens = await this.createTokenPair(user.id, user.email);
    return {
      ...tokens,
      user: sessionUser,
    };
  }

  async refreshTokens(refreshToken: string) {
    // Find the refresh token in database
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Check if token has expired
    if (storedToken.expiresAt < new Date()) {
      // Delete expired token
      await this.prisma.refreshToken.delete({
        where: { id: storedToken.id },
      });
      throw new UnauthorizedException('Refresh token has expired');
    }

    // Check if user is still active
    if (storedToken.user.status === UserStatus.pending) {
      throw new UnauthorizedException('Account pending approval');
    }

    // Revoke the old refresh token (token rotation)
    await this.prisma.refreshToken.delete({
      where: { id: storedToken.id },
    });

    // Generate new token pair
    const tokens = await this.createTokenPair(
      storedToken.user.id,
      storedToken.user.email,
    );

    return tokens;
  }

  async revokeRefreshToken(refreshToken?: string): Promise<void> {
    if (!refreshToken) return;
    try {
      await this.prisma.refreshToken.deleteMany({
        where: { token: refreshToken },
      });
    } catch {
      // Silently ignore - don't leak whether token existed
    }
  }

  async getApiToken(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, apiToken: true },
    });

    if (!user) {
      throw new ForbiddenException('User not found');
    }

    if (user.status !== UserStatus.active) {
      throw new ForbiddenException('Account pending approval');
    }

    return { apiToken: user.apiToken };
  }

  async revokeApiToken(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });

    if (!user) {
      throw new ForbiddenException('User not found');
    }

    if (user.status !== UserStatus.active) {
      throw new ForbiddenException('Account pending approval');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { apiToken: null },
    });

    return { apiToken: null };
  }

  async regenerateApiToken(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });

    if (!user) {
      throw new ForbiddenException('User not found');
    }

    if (user.status !== UserStatus.active) {
      throw new ForbiddenException('Account pending approval');
    }

    const apiToken = await this.generateUniqueApiToken();
    await this.prisma.user.update({
      where: { id: userId },
      data: { apiToken },
    });

    return { apiToken };
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true, dekPasswordWrapped: true },
    });

    if (!user) {
      throw new ForbiddenException('User not found');
    }

    // OIDC users don't have passwords
    if (!user.password) {
      throw new BadRequestException(
        'Password change is not available for OIDC-authenticated users. Please change your password through your identity provider.',
      );
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(
      changePasswordDto.currentPassword,
      user.password,
    );

    if (!isCurrentPasswordValid) {
      throw new ForbiddenException('Current password is incorrect');
    }

    // Check if new password is different from current password
    const isSamePassword = await bcrypt.compare(
      changePasswordDto.newPassword,
      user.password,
    );

    if (isSamePassword) {
      throw new BadRequestException(
        'New password must be different from current password',
      );
    }

    if (user.dekPasswordWrapped) {
      if (
        !changePasswordDto.passwordKdfSalt ||
        !changePasswordDto.dekPasswordWrapped
      ) {
        throw new BadRequestException(
          'Updated encryption wrap is required when changing password for accounts with note encryption.',
        );
      }
    } else if (
      changePasswordDto.passwordKdfSalt ||
      changePasswordDto.dekPasswordWrapped
    ) {
      throw new BadRequestException(
        'Encryption wrap fields are only for accounts with an encryption vault.',
      );
    }

    // Hash and update password
    const hashedPassword = await bcrypt.hash(changePasswordDto.newPassword, 10);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        ...(user.dekPasswordWrapped
          ? {
              passwordKdfSalt: changePasswordDto.passwordKdfSalt,
              dekPasswordWrapped: changePasswordDto.dekPasswordWrapped,
            }
          : {}),
      },
      select: AUTH_USER_SELECT,
    });

    return {
      message: 'Password changed successfully',
      user: this.formatSessionUser(updated),
    };
  }

  async updateProfile(userId: string, updateProfileDto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new ForbiddenException('User not found');
    }

    try {
      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: { name: updateProfileDto.name },
        select: {
          id: true,
          email: true,
          name: true,
          profileImage: true,
          isAdmin: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return updatedUser;
    } catch (error) {
      throw new BadRequestException(
        'Failed to update profile. Please try again.',
      );
    }
  }

  async uploadProfileImage(userId: string, file: Express.Multer.File) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, profileImage: true },
    });

    if (!user) {
      throw new ForbiddenException('User not found');
    }

    // Ensure uploads directory exists
    const uploadsDir = '/data/uploads/profiles';
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // File validation is handled at controller level with ParseFilePipe
    // Generate unique filename
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const filename = `${userId}-${timestamp}${ext}`;
    const filePath = path.join(uploadsDir, filename);
    const imagePath = `/uploads/profiles/${filename}`;

    const oldImagePath: string | null = user.profileImage || null;
    let fileSaved = false;

    try {
      // Save new file first
      fs.writeFileSync(filePath, file.buffer);
      fileSaved = true;

      // Update database with new image path
      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: { profileImage: imagePath },
        select: {
          id: true,
          email: true,
          name: true,
          profileImage: true,
          isAdmin: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      // Delete old image only after successful database update
      if (oldImagePath && oldImagePath !== imagePath) {
        await this.deleteProfileImage(oldImagePath);
      }

      return updatedUser;
    } catch (error) {
      // If database update fails, delete the newly uploaded file
      if (fileSaved && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (deleteError) {
          this.logger.error(`Failed to delete newly uploaded file after DB error: ${filePath}`);
        }
      }
      throw new BadRequestException(
        'Failed to upload profile image. Please try again.',
      );
    }
  }

  async removeProfileImage(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, profileImage: true },
    });

    if (!user) {
      throw new ForbiddenException('User not found');
    }

    const oldImagePath: string | null = user.profileImage || null;

    try {
      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: { profileImage: null },
        select: {
          id: true,
          email: true,
          name: true,
          profileImage: true,
          isAdmin: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      // Delete old image only after successful database update
      if (oldImagePath) {
        await this.deleteProfileImage(oldImagePath);
      }

      return updatedUser;
    } catch (error) {
      throw new BadRequestException(
        'Failed to remove profile image. Please try again.',
      );
    }
  }

  private async deleteProfileImage(profileImagePath: string): Promise<void> {
    if (!profileImagePath) return;

    try {
      // Remove /uploads prefix to get actual file path
      const relativePath = profileImagePath.startsWith('/uploads/')
        ? profileImagePath.substring('/uploads/'.length)
        : profileImagePath;

      const fullPath = path.join('/data', relativePath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    } catch (error) {
      this.logger.error(`Failed to delete old profile image at ${profileImagePath}`);
    }
  }

  // Generate a secure random refresh token
  private generateRefreshTokenString(): string {
    return crypto.randomBytes(64).toString('hex');
  }

  private async generateUniqueApiToken(): Promise<string> {
    // Retry a few times to avoid edge-case collisions on the unique column.
    for (let i = 0; i < 5; i++) {
      const candidate = generateApiToken();
      const existingUser = await this.prisma.user.findUnique({
        where: { apiToken: candidate },
        select: { id: true },
      });

      if (!existingUser) {
        return candidate;
      }
    }

    throw new BadRequestException(
      'Failed to generate API token. Please try again.',
    );
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, password: true },
    });
    if (!user?.password) {
      return { ok: true };
    }

    await this.prisma.passwordResetOtp.deleteMany({ where: { email } });

    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await this.prisma.passwordResetOtp.create({
      data: {
        email,
        codeHash: this.hashPasswordResetOtp(code),
        expiresAt,
      },
    });

    await this.emailService.sendPasswordResetOtp(email, code);
    return { ok: true };
  }

  async verifyPasswordResetOtp(dto: VerifyPasswordResetOtpDto) {
    const email = dto.email.trim().toLowerCase();
    const row = await this.prisma.passwordResetOtp.findFirst({
      where: {
        email,
        consumed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!row || row.attempts >= 8) {
      throw new UnauthorizedException('Invalid or expired code');
    }

    const matches = this.hashPasswordResetOtp(dto.code) === row.codeHash;

    await this.prisma.passwordResetOtp.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    });

    if (!matches) {
      throw new UnauthorizedException('Invalid or expired code');
    }

    await this.prisma.passwordResetOtp.update({
      where: { id: row.id },
      data: { consumed: true },
    });

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        password: true,
        dekRecoveryWrapped: true,
        recoveryKdfSalt: true,
        passwordKdfSalt: true,
      },
    });

    if (
      !user?.password ||
      !user.dekRecoveryWrapped ||
      !user.recoveryKdfSalt ||
      !user.passwordKdfSalt
    ) {
      throw new BadRequestException(
        'Password reset is not available for this account.',
      );
    }

    const resetToken = this.jwtService.sign(
      { sub: user.id, typ: 'password_reset' },
      { expiresIn: '15m' },
    );

    return {
      resetToken,
      encryption: {
        dekRecoveryWrapped: user.dekRecoveryWrapped,
        recoveryKdfSalt: user.recoveryKdfSalt,
        passwordKdfSalt: user.passwordKdfSalt,
      },
    };
  }

  async completePasswordReset(dto: CompletePasswordResetDto) {
    let payload: { sub: string; typ?: string };
    try {
      payload = this.jwtService.verify<{ sub: string; typ?: string }>(
        dto.resetToken,
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired reset session');
    }

    if (payload.typ !== 'password_reset') {
      throw new UnauthorizedException('Invalid or expired reset session');
    }

    const userId = payload.sub;

    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        status: true,
        dekRecoveryWrapped: true,
        recoveryKdfSalt: true,
        passwordKdfSalt: true,
      },
    });

    if (!existing || existing.status !== UserStatus.active) {
      throw new UnauthorizedException('Invalid or expired reset session');
    }

    if (
      !existing.dekRecoveryWrapped ||
      !existing.recoveryKdfSalt ||
      !existing.passwordKdfSalt
    ) {
      throw new BadRequestException('Account vault is not configured');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.refreshToken.deleteMany({ where: { userId } });

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        dekPasswordWrapped: dto.newDekPasswordWrapped,
      },
    });

    const fresh = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: AUTH_USER_SELECT,
    });

    const tokens = await this.createTokenPair(fresh.id, fresh.email);

    return {
      ...tokens,
      user: this.formatSessionUser(fresh),
    };
  }

  private validateRegistrationVault(dto: RegisterDto) {
    const parts = [
      dto.dekPasswordWrapped,
      dto.dekRecoveryWrapped,
      dto.passwordKdfSalt,
      dto.recoveryKdfSalt,
    ];
    const ok = parts.every((p) => typeof p === 'string' && p.length > 0);
    if (!ok) {
      throw new BadRequestException(
        'Client-side encryption vault fields are required for password registration.',
      );
    }
  }

  private hashPasswordResetOtp(code: string): string {
    const pepper = this.configService.get<string>('JWT_SECRET') ?? '';
    return crypto
      .createHash('sha256')
      .update(`${pepper}:pwd_reset:${code}`)
      .digest('hex');
  }

  private formatSessionUser(
    user: {
      id: string;
      email: string;
      name: string;
      profileImage: string | null;
      isAdmin: boolean;
      status: UserStatus;
      createdAt: Date;
      updatedAt: Date;
      dekPasswordWrapped: string | null;
      dekRecoveryWrapped: string | null;
      passwordKdfSalt: string | null;
      recoveryKdfSalt: string | null;
    },
  ): SessionUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      profileImage: user.profileImage,
      isAdmin: user.isAdmin,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      encryption: buildEncryptionPayload(user),
    };
  }

  /**
   * Create access and refresh token pair for a user.
   * Used by login, register, and OIDC flows.
   */
  async createTokenPair(userId: string, email: string) {
    const payload = { email, sub: userId };

    // Generate access token (short-lived)
    const accessToken = this.jwtService.sign(payload);

    // Generate refresh token (long-lived)
    const refreshTokenString = this.generateRefreshTokenString();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_VALIDITY_DAYS);

    // Store refresh token in database
    await this.prisma.refreshToken.create({
      data: {
        token: refreshTokenString,
        userId,
        expiresAt,
      },
    });

    return {
      access_token: accessToken,
      refresh_token: refreshTokenString,
    };
  }
}
