const input = document.getElementById("habitInput");
const button = document.getElementById("addBtn");
const list = document.getElementById("habitList");
const summary = document.getElementById("summary");
const themeBtn = document.getElementById("themeBtn");

if (localStorage.getItem("theme") === "dark") {
  document.body.classList.add("dark");
  themeBtn.textContent = "☀️";
}

themeBtn.addEventListener("click", function () {
  document.body.classList.toggle("dark");
  const isDark = document.body.classList.contains("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
  themeBtn.textContent = isDark ? "☀️" : "🌙";
});

let habits = [];

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

function getStreak(dates) {
  const day = new Date();
  if (!dates.includes(dateKey(day))) {
    day.setDate(day.getDate() - 1);
  }
  let streak = 0;
  while (dates.includes(dateKey(day))) {
    streak++;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}

async function loadHabits() {
  const response = await fetch("/api/habits");
  habits = await response.json();
  render();
}

function render() {
  list.innerHTML = "";
  const today = dateKey(new Date());

  const doneCount = habits.filter(function (habit) {
    return habit.dates.includes(today);
  }).length;

  if (habits.length === 0) {
    summary.textContent = "";
  } else if (doneCount === habits.length) {
    summary.textContent = "All done today! 🎉";
  } else {
    summary.textContent = "Done today: " + doneCount + " / " + habits.length;
  }

  habits.forEach(function (habit) {
    const doneToday = habit.dates.includes(today);

    const li = document.createElement("li");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = doneToday;

    const label = document.createElement("span");
    label.className = "habit-name";
    label.textContent = habit.text;
    if (doneToday) {
      label.classList.add("done");
    }

    const streak = document.createElement("span");
    streak.className = "streak";
    streak.textContent = "🔥 " + getStreak(habit.dates);

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "X";
    deleteBtn.className = "delete";

    checkbox.addEventListener("change", async function () {
      await fetch("/api/habits/" + habit.id + "/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: today })
      });
      loadHabits();
    });

    deleteBtn.addEventListener("click", async function () {
      await fetch("/api/habits/" + habit.id, { method: "DELETE" });
      loadHabits();
    });

    li.appendChild(checkbox);
    li.appendChild(label);
    li.appendChild(streak);
    li.appendChild(deleteBtn);
    list.appendChild(li);
  });
}

button.addEventListener("click", async function () {
  const text = input.value.trim();
  if (text === "") {
    return;
  }
  await fetch("/api/habits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: text })
  });
  input.value = "";
  loadHabits();
});

loadHabits();