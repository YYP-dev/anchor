import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsNotEmpty()
  currentPassword: string;

  @IsNotEmpty()
  @MinLength(8)
  newPassword: string;

  @IsOptional()
  @IsString()
  passwordKdfSalt?: string;

  @IsOptional()
  @IsString()
  dekPasswordWrapped?: string;
}
