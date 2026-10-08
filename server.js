
const express = require("express");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "20kb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "https://petrenkonikolaj5-cyber.github.io");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Временное хранилище для тестирования
const users = new Map();
const sessions = new Map();

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username
  };
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", app: "ClipFlow 2.0" });
});

// Регистрация
app.post("/api/register", (req, res) => {
  const { username, email, password } = req.body || {};

  if (
    typeof username !== "string" ||
    typeof email !== "string" ||
    typeof password !== "string" ||
    username.trim().length < 3 ||
    username.trim().length > 30 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    password.length < 8 ||
    password.length > 128
  ) {
    return res.status(400).json({
      error: "Проверь данные. Пароль — минимум 8 символов."
    });
  }

  const key = email.trim().toLowerCase();

  if (users.has(key)) {
    return res.status(409).json({
      error: "Такой Email уже зарегистрирован"
    });
  }

  const salt = crypto.randomBytes(16).toString("hex");

  const user = {
    id: crypto.randomUUID(),
    username: username.trim(),
    email: key,
    salt,
    passwordHash: hashPassword(password, salt)
  };

  users.set(key, user);

  res.status(201).json({
    message: "Аккаунт создан",
    user: publicUser(user)
  });
});

// Вход
app.post("/api/login", (req, res) => {
  const { email, password } = req.body || {};

  if (typeof email !== "string" ||
      typeof password !== "string") {
    return res.status(400).json({
      error: "Введите Email и пароль"
    });
  }

  const user = users.get(email.trim().toLowerCase());

  if (!user || password.length > 128) {
    return res.status(401).json({
      error: "Неверный Email или пароль"
    });
  }

  const suppliedHash = Buffer.from(
    hashPassword(password, user.salt), "hex"
  );
  const storedHash = Buffer.from(user.passwordHash, "hex");

  if (!crypto.timingSafeEqual(suppliedHash, storedHash)) {
    return res.status(401).json({
      error: "Неверный Email или пароль"
    });
  }

  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, user.id);

  res.json({
    message: "Вход выполнен",
    token,
    user: publicUser(user)
  });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`ClipFlow 2.0 запущен на порту ${PORT}`);
});
