const express = require("express");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const app = express();
const db = new DatabaseSync("habits.db");

db.exec("CREATE TABLE IF NOT EXISTS habits (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL)");
db.exec("CREATE TABLE IF NOT EXISTS completions (habit_id INTEGER NOT NULL, date TEXT NOT NULL, PRIMARY KEY (habit_id, date))");
db.exec("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL)");
db.exec("CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL)");

try {
  db.exec("ALTER TABLE habits ADD COLUMN user_id INTEGER");
} catch (error) {
  console.log("user_id column already exists");
}

app.use(express.json());
app.use(express.static("public"));

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return salt + ":" + hash;
}

function checkPassword(password, stored) {
  const parts = stored.split(":");
  const salt = parts[0];
  const savedHash = Buffer.from(parts[1], "hex");
  const attempt = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(savedHash, attempt);
}

function getCookie(req, name) {
  const header = req.headers.cookie || "";
  const match = header
    .split(";")
    .map(function (part) {
      return part.trim();
    })
    .find(function (part) {
      return part.startsWith(name + "=");
    });
  return match ? match.slice(name.length + 1) : null;
}

function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions (token, user_id) VALUES (?, ?)").run(token, userId);
  res.setHeader("Set-Cookie", "session=" + token + "; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800");
}

function getUser(req) {
  const token = getCookie(req, "session");
  if (!token) {
    return null;
  }
  const user = db
    .prepare("SELECT users.id AS id, users.username AS username FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = ?")
    .get(token);
  return user || null;
}

function requireUser(req, res, next) {
  const user = getUser(req);
  if (!user) {
    return res.status(401).json({ error: "Not logged in" });
  }
  req.user = user;
  next();
}

app.post("/api/signup", function (req, res) {
  const username = (req.body.username || "").trim();
  const password = req.body.password || "";
  if (username.length < 3) {
    return res.status(400).json({ error: "Username must be at least 3 characters" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) {
    return res.status(409).json({ error: "Username already taken" });
  }
  const result = db
    .prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
    .run(username, hashPassword(password));
  startSession(res, Number(result.lastInsertRowid));
  res.status(201).json({ username: username });
});

app.post("/api/login", function (req, res) {
  const username = (req.body.username || "").trim();
  const password = req.body.password || "";
  const user = db.prepare("SELECT id, password_hash FROM users WHERE username = ?").get(username);
  if (!user || !checkPassword(password, user.password_hash)) {
    return res.status(401).json({ error: "Wrong username or password" });
  }
  startSession(res, user.id);
  res.json({ username: username });
});

app.post("/api/logout", function (req, res) {
  const token = getCookie(req, "session");
  if (token) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  }
  res.setHeader("Set-Cookie", "session=; HttpOnly; Path=/; Max-Age=0");
  res.json({ success: true });
});

app.get("/api/me", function (req, res) {
  const user = getUser(req);
  if (!user) {
    return res.status(401).json({ error: "Not logged in" });
  }
  res.json({ username: user.username });
});

function getHabit(id, userId) {
  const habit = db
    .prepare("SELECT id, text FROM habits WHERE id = ? AND user_id = ?")
    .get(id, userId);
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

function getAllHabits(userId) {
  const rows = db.prepare("SELECT id FROM habits WHERE user_id = ? ORDER BY id").all(userId);
  return rows.map(function (row) {
    return getHabit(row.id, userId);
  });
}

app.get("/api/habits", requireUser, function (req, res) {
  res.json(getAllHabits(req.user.id));
});

app.post("/api/habits", requireUser, function (req, res) {
  const text = (req.body.text || "").trim();
  if (text === "") {
    return res.status(400).json({ error: "Text is required" });
  }
  const result = db
    .prepare("INSERT INTO habits (text, user_id) VALUES (?, ?)")
    .run(text, req.user.id);
  res.status(201).json(getHabit(Number(result.lastInsertRowid), req.user.id));
});

app.delete("/api/habits/:id", requireUser, function (req, res) {
  const id = Number(req.params.id);
  if (!getHabit(id, req.user.id)) {
    return res.status(404).json({ error: "Habit not found" });
  }
  db.prepare("DELETE FROM completions WHERE habit_id = ?").run(id);
  db.prepare("DELETE FROM habits WHERE id = ?").run(id);
  res.json({ success: true });
});

app.post("/api/habits/:id/toggle", requireUser, function (req, res) {
  const id = Number(req.params.id);
  const date = req.body.date;
  if (!date) {
    return res.status(400).json({ error: "Date is required" });
  }
  if (!getHabit(id, req.user.id)) {
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
  res.json(getHabit(id, req.user.id));
});

app.listen(3000, function () {
  console.log("Server running on http://localhost:3000");
});