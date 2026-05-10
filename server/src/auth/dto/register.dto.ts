import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => value?.trim())
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  dekPasswordWrapped?: string;

  @IsOptional()
  @IsString()
  dekRecoveryWrapped?: string;

  @IsOptional()
  @IsString()
  passwordKdfSalt?: string;

  @IsOptional()
  @IsString()
  recoveryKdfSalt?: string;
}
