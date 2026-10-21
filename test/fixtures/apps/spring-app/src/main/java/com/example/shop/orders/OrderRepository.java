package com.example.shop.orders;

import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OrderRepository extends JpaRepository<Order, Long> {

  Page<Order> findByCustomerNameContainingIgnoreCase(String q, Pageable pageable);

  List<Order> findByStatusInAndCreatedAtBetween(List<Status> statuses, Instant from, Instant to);

  List<Order> findTop10ByOrderByCreatedAtDesc();

  @Query("select o from Order o where lower(o.reference) like lower(concat('%', :q, '%'))")
  List<Order> searchByReference(@Param("q") String q);

  // List<Order> findByLegacyCodeContaining(String code);
}
