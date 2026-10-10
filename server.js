
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

app.use(express.json({ limit: "20kb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "https://petrenkonikolaj5-cyber.github.io");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});


const sessions = new Map();



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
app.post("/api/register", async (req, res) => {
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

  

  const { data, error } = await supabase.auth.admin.createUser({
  email: key,
  password,
  email_confirm: true,
  user_metadata: { username: username.trim() }
});

if (error || !data?.user) {
  return res.status(400).json({
    error: error?.message || "Ошибка регистрации"
  });
}

const user = {
  id: data.user.id,
  username: data.user.user_metadata?.username || username.trim()
};

  res.status(201).json({
    message: "Аккаунт создан",
    user: publicUser(user)
  });
});

// Вход
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body || {};

  if (typeof email !== "string" ||
      typeof password !== "string") {
    return res.status(400).json({
      error: "Введите Email и пароль"
    });
  }

  const { data: loginData, error: loginError } =
  await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password
  });

if (loginError || !loginData.user) {
  return res.status(401).json({
    error: "Неверный Email или пароль"
  });
}

  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, loginData.user.id);

  res.json({
    message: "Вход выполнен",
    token,
    user: {
  id: loginData.user.id,
  username: loginData.user.user_metadata?.username || "Пользователь"
}
  });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`ClipFlow 2.0 запущен на порту ${PORT}`);
});
