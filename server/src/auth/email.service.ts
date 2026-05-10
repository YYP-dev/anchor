import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendPasswordResetOtp(email: string, code: string): Promise<void> {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    const from =
      this.configService.get<string>('RESEND_FROM') ||
      'Anchor <onboarding@resend.dev>';

    if (!apiKey) {
      this.logger.warn(
        `[dev] Password reset OTP for ${email}: ${code} (set RESEND_API_KEY to send email)`,
      );
      return;
    }

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: email,
      subject: 'Your Anchor password reset code',
      html: `<p>Your one-time code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p><p>This code expires in 15 minutes.</p>`,
    });

    if (error) {
      this.logger.error(`Resend error: ${JSON.stringify(error)}`);
      throw new Error('Failed to send reset email');
    }
  }
}
