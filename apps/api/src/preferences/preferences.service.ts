import { Injectable } from '@nestjs/common';
import type { Preferences, PreferencesPatch } from '@biblestdy/shared';
import type { PreferencesStore } from './preferences.store';

/** Per-account preferences (#45 reader style, #61 text size): follow the
 * user across devices. */
@Injectable()
export class PreferencesService {
  constructor(private readonly store: PreferencesStore) {}

  get(userId: string): Promise<Preferences> {
    return this.store.get(userId);
  }

  async update(userId: string, patch: PreferencesPatch): Promise<Preferences> {
    await this.store.update(userId, patch);
    return this.get(userId);
  }
}
