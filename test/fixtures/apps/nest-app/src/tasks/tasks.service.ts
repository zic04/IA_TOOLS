import { Injectable } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';

@Injectable()
export class TasksService {
  @Cron('0 * * * *')
  purgeExpired() {}

  @Interval('sync-stock', 5000)
  syncStock() {}
}
