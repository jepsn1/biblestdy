import type { Preferences, PreferencesPatch } from '@biblestdy/shared';
import type { PreferencesStore } from './preferences.store';

export class InMemoryPreferencesStore implements PreferencesStore {
  private rows = new Map<string, Preferences>();

  get(userId: string) {
    return Promise.resolve(
      this.rows.get(userId) ?? { readerStyle: null, textSize: null },
    );
  }

  async update(userId: string, patch: PreferencesPatch) {
    this.rows.set(userId, { ...(await this.get(userId)), ...patch });
  }
}
