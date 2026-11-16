import { Controller, Get, Inject } from '@nestjs/common';
import type { Translation } from '@biblestdy/shared';
import { SCRIPTURE_PROVIDER, type ScriptureProvider } from './provider';

/**
 * Public (no session): the copyright page (ToS §7.1) is linked from the
 * signed-out landing page too. Metadata only — names, abbreviations and the
 * rights holders' copyright lines, never Scripture text.
 */
@Controller()
export class CopyrightController {
  constructor(
    @Inject(SCRIPTURE_PROVIDER) private readonly provider: ScriptureProvider,
  ) {}

  @Get('copyright')
  list(): Promise<Translation[]> {
    return this.provider.listTranslations();
  }
}
