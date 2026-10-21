using System.ComponentModel.DataAnnotations;

namespace Shop.Api.Models;

public class OrderDto
{
    [Required]
    [StringLength(80, MinimumLength = 1)]
    public string Customer { get; set; } = "";

    [MaxLength(20)]
    public string? Reference { get; set; }

    [Range(1, 99)]
    public int Quantity { get; set; }

    [EmailAddress]
    public string? ContactEmail { get; set; }

    [RegularExpression("^[A-Z]{3}$")]
    public string Currency { get; set; } = "EUR";
}

public record ProductDto([Required] string Name, [Range(0, 10000)] int Stock);
