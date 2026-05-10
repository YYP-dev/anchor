import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { SessionUser } from '../session-user';

export const CurrentUser = createParamDecorator(
  (data: keyof SessionUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const payload = request.user;

    if (!payload) return null;

    return data ? payload[data] : payload;
  },
);
