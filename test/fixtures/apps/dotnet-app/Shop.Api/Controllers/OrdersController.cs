using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Shop.Api.Models;

namespace Shop.Api.Controllers;

// The orders of the shop: every action needs a signed-in user, the writes an administrator.
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class OrdersController : ControllerBase
{
    private readonly ShopDb _db;

    public OrdersController(ShopDb db) => _db = db;

    [HttpGet]
    public async Task<ActionResult<List<Order>>> List(
        [FromQuery] string? q,
        [FromQuery(Name = "page")] int pageNumber = 1,
        [FromQuery] int pageSize = 20)
    {
        return await _db.Orders
            .Where(o => o.Customer.ToLower().Contains(q))
            .Where(o => o.Total >= 10)
            .OrderByDescending(o => o.CreatedAt)
            .Skip((pageNumber - 1) * pageSize)
            .Take(20)
            .ToListAsync();
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<Order>> Get(int id) => await _db.Orders.FindAsync(id);

    [HttpPost]
    [Authorize(Roles = "Admin")]
    public IActionResult Create(OrderDto order) => Ok();

    [HttpPut("{id:int}")]
    public IActionResult Update(int id, OrderDto order) => Ok();

    [HttpDelete("{id}"), Authorize(Policy = "CanDelete")]
    public IActionResult Delete(int id) => NoContent();

    [HttpGet("~/health")]
    [AllowAnonymous]
    public IActionResult Health() => Ok("up");

    [Route("export")]
    [HttpGet]
    public IActionResult Export() =>
        Ok(_db.Orders.Where(o => EF.Functions.Like(o.Reference, "%" + "x" + "%")).ToList());

    [HttpPatch("{id}/[action]")]
    public async Task<IActionResult> ArchiveAsync(int id) => Ok();

    [HttpGet(OrderRoutes.Legacy)]
    public IActionResult Legacy() => Ok();

    // [HttpGet("old")]
    // public IActionResult Old() => Ok();

    /* [HttpPost("import")]
    public IActionResult Import() => Ok(); */
}
