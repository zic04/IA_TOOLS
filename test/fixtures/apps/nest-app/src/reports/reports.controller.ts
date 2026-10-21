import { Controller, Delete, Get, Param, UseGuards } from '@nestjs/common';
import { Role } from '../auth/role.enum';
import { Roles } from '../auth/roles.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RolesGuard } from '../auth/roles.guard';
import { REPORTS_PATH } from './reports.constants';

@Controller()
export class ReportsController {
  @Get('reports/:year')
  @UseGuards(new RolesGuard(), PermissionsGuard)
  @Roles(Role.Admin)
  byYear(@Param('year') year: string) {
    return { year };
  }

  @Delete('/reports/:year/')
  remove(@Param('year') year: string) {
    return { year };
  }

  @Get(REPORTS_PATH)
  latest() {
    return {};
  }
}
