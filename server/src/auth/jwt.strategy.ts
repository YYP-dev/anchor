import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { buildEncryptionPayload } from './utils/encryption-payload.util';

const JWT_USER_SELECT = {
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
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'defaultSecret',
    });
  }

  async validate(payload: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: JWT_USER_SELECT,
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Reject pending users
    if (user.status === 'pending') {
      throw new UnauthorizedException('Account pending approval');
    }

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
}
