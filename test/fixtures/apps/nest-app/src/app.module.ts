import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { HealthController } from './health/health.controller';
import { OrdersController } from './orders/orders.controller';
import { ReportsController } from './reports/reports.controller';
import { TasksService } from './tasks/tasks.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [OrdersController, ReportsController, HealthController],
  providers: [TasksService, { provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
