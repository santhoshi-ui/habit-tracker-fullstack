const express = require("express");
const { DatabaseSync } = require("node:sqlite");

const app = express();
const db = new DatabaseSync("habits.db");

db.exec("CREATE TABLE IF NOT EXISTS habits (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL)");
db.exec("CREATE TABLE IF NOT EXISTS completions (habit_id INTEGER NOT NULL, date TEXT NOT NULL, PRIMARY KEY (habit_id, date))");

app.use(express.json());
app.use(express.static("public"));

function getHabit(id) {
  const habit = db.prepare("SELECT id, text FROM habits WHERE id = ?").get(id);
  if (!habit) {
    return null;
  }
  const dates = db
    .prepare("SELECT date FROM completions WHERE habit_id = ? ORDER BY date")
    .all(id)
    .map(function (row) {
      return row.date;
    });
  return { id: habit.id, text: habit.text, dates: dates };
}

function getAllHabits() {
  const rows = db.prepare("SELECT id FROM habits ORDER BY id").all();
  return rows.map(function (row) {
    return getHabit(row.id);
  });
}

app.get("/api/habits", function (req, res) {
  res.json(getAllHabits());
});

app.post("/api/habits", function (req, res) {
  const text = (req.body.text || "").trim();
  if (text === "") {
    return res.status(400).json({ error: "Text is required" });
  }
  const result = db.prepare("INSERT INTO habits (text) VALUES (?)").run(text);
  res.status(201).json(getHabit(Number(result.lastInsertRowid)));
});

app.delete("/api/habits/:id", function (req, res) {
  const id = Number(req.params.id);
  db.prepare("DELETE FROM completions WHERE habit_id = ?").run(id);
  db.prepare("DELETE FROM habits WHERE id = ?").run(id);
  res.json({ success: true });
});

app.post("/api/habits/:id/toggle", function (req, res) {
  const id = Number(req.params.id);
  const date = req.body.date;
  if (!date) {
    return res.status(400).json({ error: "Date is required" });
  }
  if (!getHabit(id)) {
    return res.status(404).json({ error: "Habit not found" });
  }
  const existing = db
    .prepare("SELECT 1 AS found FROM completions WHERE habit_id = ? AND date = ?")
    .get(id, date);
  if (existing) {
    db.prepare("DELETE FROM completions WHERE habit_id = ? AND date = ?").run(id, date);
  } else {
    db.prepare("INSERT INTO completions (habit_id, date) VALUES (?, ?)").run(id, date);
  }
  res.json(getHabit(id));
});

app.listen(3000, function () {
  console.log("Server running on http://localhost:3000");
});