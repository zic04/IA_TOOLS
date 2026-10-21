import { Controller, Get } from '@nestjs/common';
import { Test } from '@nestjs/testing';

// A controller written for a test: never read as a route of the application.
@Controller('never')
class FakeController {
  @Get()
  find() {
    return [];
  }
}

describe('OrdersController', () => {
  it('compiles', async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [FakeController] }).compile();
    expect(moduleRef).toBeDefined();
  });
});
