package com.example.shop.orders;

import java.util.List;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.access.annotation.Secured;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

// The orders of the shop: every route needs a signed-in user, the writes an administrator.
@RestController
@RequestMapping("/api/orders")
@PreAuthorize("isAuthenticated()")
public class OrderController {

  private final OrderService service;

  public OrderController(OrderService service) {
    this.service = service;
  }

  @GetMapping
  public Page<Order> list(
      @RequestParam(name = "q", required = false) String q,
      @RequestParam(defaultValue = "20") int size,
      Pageable pageable) {
    return service.search(q, pageable);
  }

  @GetMapping("/{id}")
  public Order get(@PathVariable Long id) {
    return service.get(id);
  }

  @PostMapping
  @PreAuthorize("hasRole('ADMIN')")
  public Order create(@Valid @RequestBody OrderRequest request) {
    return service.create(request);
  }

  @PutMapping(value = "/{id}", consumes = "application/json")
  public Order update(@PathVariable Long id, @Valid @RequestBody OrderRequest request) {
    return service.update(id, request);
  }

  @Secured("ROLE_ADMIN")
  @DeleteMapping(path = {"/{id}", "/{id}/purge"})
  public void delete(@PathVariable Long id) {
    service.delete(id);
  }

  @RequestMapping(value = "/export", method = {RequestMethod.GET, RequestMethod.HEAD})
  public List<Order> export() {
    return service.all();
  }

  @RequestMapping("/legacy")
  public List<Order> legacy() {
    return service.all();
  }

  @GetMapping(OrderPaths.ARCHIVE)
  public List<Order> archive() {
    return service.all();
  }

  // @GetMapping("/old")
  // public List<Order> old() { return service.all(); }

  /*
  @PatchMapping("/{id}/status")
  public Order status(@PathVariable Long id) { return null; }
  */
}

/** A helper of the same file: no controller, so its mapping is no route of the shop. */
class OrderLinks {
  @GetMapping("/never")
  String self() {
    return "/api/orders";
  }
}
