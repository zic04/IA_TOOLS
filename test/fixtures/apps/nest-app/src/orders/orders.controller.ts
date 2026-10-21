import { All, Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(AuthGuard('jwt'))
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  findAll(@Query('q') q: string, @Query('page') page = 1) {
    return this.orders.findAll(q, page);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.orders.findOne(id);
  }

  @Post()
  // only the people who manage orders
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  create(@Body() dto: CreateOrderDto) {
    return this.orders.create(dto);
  }

  // @Delete(':id')
  // remove(@Param('id') id: string) {}

  /* @Put(':id/legacy') */
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: CreateOrderDto) {
    return this.orders.update(id, dto);
  }

  @All('webhook')
  @Public()
  webhook(@Body() payload: unknown) {
    return this.orders.notify(payload);
  }
}
