const express = require("express");
const app = express();

app.use(express.json());

let habits = [
  { id: 1, text: "Drink water", dates: [] },
  { id: 2, text: "Read 10 pages", dates: [] }
];
let nextId = 3;

app.get("/", function (req, res) {
  res.send("Hello from the kitchen!");
});

app.get("/api/habits", function (req, res) {
  res.json(habits);
});

app.post("/api/habits", function (req, res) {
  const text = (req.body.text || "").trim();
  if (text === "") {
    return res.status(400).json({ error: "Text is required" });
  }
  const habit = { id: nextId, text: text, dates: [] };
  nextId++;
  habits.push(habit);
  res.status(201).json(habit);
});

app.delete("/api/habits/:id", function (req, res) {
  const id = Number(req.params.id);
  habits = habits.filter(function (h) {
    return h.id !== id;
  });
  res.json({ success: true });
});

app.post("/api/habits/:id/toggle", function (req, res) {
  const id = Number(req.params.id);
  const date = req.body.date;
  if (!date) {
    return res.status(400).json({ error: "Date is required" });
  }
  const habit = habits.find(function (h) {
    return h.id === id;
  });
  if (!habit) {
    return res.status(404).json({ error: "Habit not found" });
  }
  if (habit.dates.includes(date)) {
    habit.dates = habit.dates.filter(function (d) {
      return d !== date;
    });
  } else {
    habit.dates.push(date);
  }
  res.json(habit);
});

app.listen(3000, function () {
  console.log("Server running on http://localhost:3000");
});