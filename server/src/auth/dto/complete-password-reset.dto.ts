import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CompletePasswordResetDto {
  @IsString()
  @IsNotEmpty()
  resetToken: string;

  @IsString()
  @MinLength(8)
  newPassword: string;

  @IsString()
  @IsNotEmpty()
  newDekPasswordWrapped: string;
}
