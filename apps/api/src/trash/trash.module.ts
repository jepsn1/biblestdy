import { Module } from '@nestjs/common';
import { TrashPurgeSchedule } from './purge.schedule';

/** Soft delete housekeeping (#64): undo works for an hour, then rows go. */
@Module({ providers: [TrashPurgeSchedule] })
export class TrashModule {}
