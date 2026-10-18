using Microsoft.AspNetCore.Mvc;
using Xunit;

namespace Shop.Api.Tests;

// A test is never read: its controller is no route of the shop.
[ApiController]
[Route("test-only")]
public class FakeController : ControllerBase
{
    [HttpGet]
    public IActionResult Get() => Ok();
}

public class OrdersControllerTests
{
    [Fact]
    public void Lists() { }
}
