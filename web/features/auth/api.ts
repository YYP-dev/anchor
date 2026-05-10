import { api } from "@/lib/api/client";
import type {
  ApiTokenResponse,
  AuthResponse,
  LoginCredentials,
  RegisterCredentials,
  ChangePasswordCredentials,
  ChangePasswordResponse,
  VerifyPasswordResetResponse,
  UpdateProfileDto,
  OidcConfig,
  OidcExchangeResponse,
  User
} from "./types";

export async function login(credentials: LoginCredentials): Promise<AuthResponse> {
  return api.post("api/auth/login", { json: credentials }).json<AuthResponse>();
}

export async function register(credentials: RegisterCredentials): Promise<AuthResponse> {
  return api.post("api/auth/register", { json: credentials }).json<AuthResponse>();
}

export async function getMe(): Promise<User> {
  return api.get("api/auth/me").json<User>();
}

export async function getRegistrationMode(): Promise<{ mode: "disabled" | "enabled" | "review" }> {
  return api.get("api/auth/registration-mode").json<{ mode: "disabled" | "enabled" | "review" }>();
}

export async function changePassword(credentials: ChangePasswordCredentials): Promise<ChangePasswordResponse> {
  return api.post("api/auth/change-password", { json: credentials }).json<ChangePasswordResponse>();
}

export async function forgotPassword(email: string): Promise<{ ok: boolean }> {
  return api.post("api/auth/forgot-password", { json: { email } }).json<{ ok: boolean }>();
}

export async function verifyPasswordResetOtp(
  email: string,
  code: string,
): Promise<VerifyPasswordResetResponse> {
  return api
    .post("api/auth/verify-password-reset-otp", { json: { email, code } })
    .json<VerifyPasswordResetResponse>();
}

export async function completePasswordReset(body: {
  resetToken: string;
  newPassword: string;
  newDekPasswordWrapped: string;
}): Promise<AuthResponse> {
  return api.post("api/auth/complete-password-reset", { json: body }).json<AuthResponse>();
}

export async function updateProfile(data: UpdateProfileDto): Promise<User> {
  return api.patch("api/auth/profile", { json: data }).json<User>();
}

export async function uploadProfileImage(imageFile: File): Promise<User> {
  const formData = new FormData();
  formData.append("image", imageFile);
  return api.post("api/auth/profile/image", { body: formData }).json<User>();
}

export async function removeProfileImage(): Promise<User> {
  return api.delete("api/auth/profile/image").json<User>();
}

export async function getApiToken(): Promise<ApiTokenResponse> {
  return api.get("api/auth/api-token").json<ApiTokenResponse>();
}

export async function regenerateApiToken(): Promise<ApiTokenResponse> {
  return api.post("api/auth/api-token/regenerate").json<ApiTokenResponse>();
}

export async function revokeApiToken(): Promise<ApiTokenResponse> {
  return api.delete("api/auth/api-token").json<ApiTokenResponse>();
}

export async function getOidcConfig(): Promise<OidcConfig> {
  return api.get("api/auth/oidc/config").json<OidcConfig>();
}

export async function exchangeOidcCode(code: string): Promise<OidcExchangeResponse> {
  return api
    .post("api/auth/oidc/exchange", { json: { code } })
    .json<OidcExchangeResponse>();
}

export async function revokeRefreshToken(refreshToken?: string | null): Promise<void> {
  if (!refreshToken) return;
  return api.post("api/auth/logout", { json: { refreshToken } }).json<void>();
}
