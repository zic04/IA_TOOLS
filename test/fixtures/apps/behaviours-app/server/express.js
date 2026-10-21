const express = require("express");
const { Parser } = require("json2csv");
const nodemailer = require("nodemailer");
const cron = require("node-cron");

const app = express();
app.get("/api/customers", async (req, res) => {
  const { page, pageSize, sort } = req.query;
  const rows = await knex("customers").where("name", "ilike", `%${req.query.q}%`).orderBy("name", "asc").limit(50);
  res.json(rows);
});
app.get("/api/customers.csv", async (req, res) => {
  res.setHeader("Content-Type", "text/csv");
  res.send(new Parser().parse(await knex("customers")));
});
cron.schedule("0 2 * * *", () => nodemailer.createTransport({}).sendMail({ to: "ops@example.com" }));
