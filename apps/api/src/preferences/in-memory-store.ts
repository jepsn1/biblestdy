import type { Preferences, PreferencesPatch } from '@biblestdy/shared';
import type { PreferencesStore } from './preferences.store';

export class InMemoryPreferencesStore implements PreferencesStore {
  private rows = new Map<string, Preferences>();
  /** Test seam: userId → its marked translation. */
  marked = new Map<string, string>();

  get(userId: string) {
    return Promise.resolve(
      this.rows.get(userId) ?? {
        readerStyle: null,
        textSize: null,
        supportNoticeDismissed: false,
        highlightLabels: {},
        singleKeyShortcuts: true,
      },
    );
  }

  async update(userId: string, patch: PreferencesPatch) {
    this.rows.set(userId, { ...(await this.get(userId)), ...patch });
  }

  markedTranslationId(userId: string) {
    return Promise.resolve(this.marked.get(userId) ?? null);
  }
}
