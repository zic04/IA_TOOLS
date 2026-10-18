using Hangfire;
using Quartz;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllers();
builder.Services.AddQuartz(q => q.AddTrigger(t => t.ForJob("purge").WithCronSchedule("0 0/5 * * * ?")));

var app = builder.Build();
app.MapControllers();

app.MapGet("/", () => "Shop API");

var api = app.MapGroup("/api/v2").RequireAuthorization();
api.MapGet("/products", (string? q, ShopDb db) =>
        db.Products.Where(p => p.Name.StartsWith(q)).OrderBy(p => p.Name).Take(50).ToList())
    .WithName("Products");
api.MapPost("/products", (Product p) => Results.Created($"/api/v2/products/{p.Id}", p))
    .RequireAuthorization("Admin");
api.MapPut("/products/{id:int}", (int id, Product p) => Results.NoContent());

var admin = api.MapGroup("/admin");
admin.RequireAuthorization("Admin");
admin.MapDelete("/cache", () => Results.NoContent());

app.MapMethods("/ping", new[] { "GET", "HEAD" }, () => "pong").AllowAnonymous();
app.MapGroup("/internal").MapGet("/metrics", () => "ok");

// app.MapGet("/old", () => "never");

RecurringJob.AddOrUpdate("nightly-report", () => Console.WriteLine("report"), Cron.Daily);

app.Run();
