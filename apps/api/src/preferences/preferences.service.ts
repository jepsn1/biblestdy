import { Injectable } from '@nestjs/common';
import type { Preferences, ReaderStyle } from '@biblestdy/shared';
import type { PreferencesStore } from './preferences.store';

/** Per-account preferences (#45): follow the user across devices. */
@Injectable()
export class PreferencesService {
  constructor(private readonly store: PreferencesStore) {}

  async get(userId: string): Promise<Preferences> {
    return { readerStyle: await this.store.readerStyle(userId) };
  }

  async setReaderStyle(
    userId: string,
    readerStyle: ReaderStyle,
  ): Promise<Preferences> {
    await this.store.setReaderStyle(userId, readerStyle);
    return this.get(userId);
  }
}
