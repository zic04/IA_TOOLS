package com.example.shop.orders;

import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class OrderService {

  private final OrderRepository repository;

  public OrderService(OrderRepository repository) {
    this.repository = repository;
  }

  public Page<Order> search(String q, Pageable pageable) {
    return repository.findByCustomerNameContainingIgnoreCase(q, pageable);
  }

  public List<Order> recent(int page) {
    return repository.findAll(PageRequest.of(page, 20, Sort.by("createdAt").descending())).getContent();
  }

  @Scheduled(cron = "0 0 * * * *")
  public void purgeDrafts() {}

  @Scheduled(fixedRate = 60_000)
  public void refreshRates() {}
}
