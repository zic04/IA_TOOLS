package com.example.shop.orders;

import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

// A test is never read: its controller is no route of the shop.
class OrderControllerTest {

  @RestController
  static class FakeController {
    @GetMapping("/test-only")
    String fake() {
      return "x";
    }
  }

  @Test
  void lists() {}
}
