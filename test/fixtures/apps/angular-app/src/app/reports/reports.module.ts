import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReportComponent } from './report.component';
import { ReportsRoutingModule } from './reports-routing.module';

@NgModule({
  declarations: [ReportComponent],
  imports: [CommonModule, ReportsRoutingModule],
})
export class ReportsModule {}
