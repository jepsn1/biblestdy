import {
  Controller,
  Delete,
  NotFoundException,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard, type AuthedRequest } from '../auth/session.guard';
import { AccountService } from './account.service';

@Controller('account')
@UseGuards(SessionGuard)
export class AccountController {
  constructor(private readonly account: AccountService) {}

  /** Deletes the CALLING user's account and every piece of their data. Their
   * sessions die with it — the client signs out and returns to /signin. */
  @Delete()
  async remove(@Req() req: AuthedRequest): Promise<{ ok: true }> {
    const deleted = await this.account.deleteAccount(req.user.id);
    if (!deleted) throw new NotFoundException();
    return { ok: true };
  }
}
