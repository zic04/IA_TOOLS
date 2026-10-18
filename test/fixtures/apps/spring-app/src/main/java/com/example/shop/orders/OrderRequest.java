package com.example.shop.orders;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public class OrderRequest {

  @NotBlank
  private String customerName;

  @Size(min = 1, max = 80)
  private String reference;

  @Min(1)
  @Max(value = 99)
  private int quantity;

  @Email
  private String contactEmail;

  @Pattern(regexp = "[A-Z]{3}")
  private String currency;

  @NotNull
  private Status status;
}
