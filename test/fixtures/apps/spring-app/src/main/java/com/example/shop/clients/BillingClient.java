package com.example.shop.clients;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

// A client of another service: its mappings are the routes it calls, never routes of the shop.
@FeignClient(name = "billing")
public interface BillingClient {
  @GetMapping("/invoices/{id}")
  Invoice invoice(@PathVariable("id") String id);
}
