import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyPasswordResetOtpDto } from './dto/verify-password-reset-otp.dto';
import { CompletePasswordResetDto } from './dto/complete-password-reset.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { SessionUser } from './session-user';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Get('registration-mode')
  getRegistrationMode() {
    return this.authService.getRegistrationMode();
  }

  @Post('register')
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('verify-password-reset-otp')
  verifyPasswordResetOtp(@Body() dto: VerifyPasswordResetOtpDto) {
    return this.authService.verifyPasswordResetOtp(dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('complete-password-reset')
  completePasswordReset(@Body() dto: CompletePasswordResetDto) {
    return this.authService.completePasswordReset(dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshTokens(refreshTokenDto.refresh_token);
  }

  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(@Body() logoutDto: LogoutDto): Promise<void> {
    return this.authService.revokeRefreshToken(logoutDto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@CurrentUser() user: SessionUser) {
    return user;
  }

  @UseGuards(JwtAuthGuard)
  @Get('api-token')
  getApiToken(@CurrentUser() user: SessionUser) {
    return this.authService.getApiToken(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('api-token')
  revokeApiToken(@CurrentUser() user: SessionUser) {
    return this.authService.revokeApiToken(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('api-token/regenerate')
  regenerateApiToken(@CurrentUser() user: SessionUser) {
    return this.authService.regenerateApiToken(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('change-password')
  changePassword(
    @CurrentUser() user: SessionUser,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.id, changePasswordDto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  async updateProfile(
    @CurrentUser() user: SessionUser,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(user.id, updateProfileDto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('profile/image')
  @UseInterceptors(FileInterceptor('image'))
  async uploadProfileImage(
    @CurrentUser() user: SessionUser,
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({
            fileType: /(image\/jpeg|image\/png|image\/webp)/,
          }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.authService.uploadProfileImage(user.id, file);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('profile/image')
  async removeProfileImage(@CurrentUser() user: SessionUser) {
    return this.authService.removeProfileImage(user.id);
  }
}
