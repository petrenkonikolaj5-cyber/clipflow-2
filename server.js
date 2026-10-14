
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;
console.log("Supabase key type:", process.env.SUPABASE_SECRET_KEY?.startsWith("sb_secret_") ? "secret" : process.env.SUPABASE_SECRET_KEY?.startsWith("eyJ") ? "legacy JWT" : "unknown");
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);
const supabaseStorage = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
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

app.post("/api/videos/upload", express.raw({
  type: "video/*",
  limit: "50mb"
}), async (req, res) => {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    const userId = sessions.get(token);

    if (!userId) {
      return res.status(401).json({ error: "Сначала войдите в аккаунт" });
    }

    if (!req.body?.length) {
      return res.status(400).json({ error: "Видео не выбрано" });
    }

    const contentType = req.headers["content-type"];
    const extension = contentType === "video/mp4" ? "mp4" : "webm";
    const filePath = `${userId}/${crypto.randomUUID()}.${extension}`;

    const { error } = await supabaseStorage.storage
      .from("videos")
      .upload(filePath, req.body, { contentType });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const { data } = supabaseStorage.storage
      .from("videos")
      .getPublicUrl(filePath);

    res.status(201).json({ url: data.publicUrl });
  } catch (error) {
    res.status(500).json({ error: "Ошибка загрузки видео" });
  }
});
app.get("/api/videos", async (req, res) => {
  try {
    const { data: folders, error } = await supabaseStorage.storage
      .from("videos")
      .list("", { limit: 100 });

    if (error) throw error;

    const videos = [];

    for (const folder of folders || []) {
      const { data: files, error: listError } = await supabaseStorage.storage
        .from("videos")
        .list(folder.name, { limit: 100, sortBy: { column: "created_at", order: "desc" } });

      if (listError) throw listError;

      for (const file of files || []) {
        if (!file.id) continue;

        const path = `${folder.name}/${file.name}`;
        const { data } = supabaseStorage.storage
          .from("videos")
          .getPublicUrl(path);

        videos.push({
          url: data.publicUrl,
          created_at: file.created_at
        });
      }
    }

    videos.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json(videos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.post("/api/videos/like", express.json(), async (req, res) => {
  try {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const userId = sessions.get(token);

    if (!userId) {
      return res.status(401).json({ error: "Сначала войдите в аккаунт" });
    }

    const { videoPath } = req.body;
    if (typeof videoPath !== "string" ||
        !/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(videoPath)) {
      return res.status(400).json({ error: "Неверное видео" });
    }

   const { data: existing, error: checkError } = await supabaseStorage
  .from("video_likes")
  .select("id")
  .eq("user_id", userId)
  .eq("video_path", videoPath)
  .maybeSingle();

if (checkError) throw checkError;

if (existing) {
  const { error } = await supabaseStorage
    .from("video_likes")
    .delete()
    .eq("user_id", userId)
    .eq("video_path", videoPath);

  if (error) throw error;
  res.json({ liked: false });
} else {
  const { error } = await supabaseStorage
    .from("video_likes")
    .insert({ user_id: userId, video_path: videoPath });

  if (error) throw error;
  res.json({ liked: true });
} 
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/videos/likes", async (req, res) => {
  try {
    const token = (req.headers.authorization || "")
      .replace(/^Bearer\s+/i, "");
    const userId = sessions.get(token);

    const { data, error } = await supabaseStorage
      .from("video_likes")
      .select("user_id, video_path");

    if (error) throw error;

    const likes = {};

    for (const row of data || []) {
      if (!likes[row.video_path]) {
        likes[row.video_path] = { count: 0, liked: false };
      }

      likes[row.video_path].count++;

      if (userId && row.user_id === userId) {
        likes[row.video_path].liked = true;
      }
    }

    res.json(likes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.post("/api/videos/comments", async (req, res) => {
  try {
    const token = (req.headers.authorization || "")
      .replace(/^Bearer\s+/i, "");

    const userId = sessions.get(token);

    if (!userId) {
      return res.status(401).json({
        error: "Сначала войдите в аккаунт"
      });
    }

    const { videoPath, comment } = req.body;

    if (
      typeof videoPath !== "string" ||
      !videoPath.trim() ||
      videoPath.length > 500 ||
      typeof comment !== "string" ||
      !comment.trim() ||
      comment.trim().length > 500
    ) {
      return res.status(400).json({
        error: "Неверный комментарий"
      });
    }

    const { data: userData, error: userError } =
      await supabaseStorage.auth.admin.getUserById(userId);

    if (userError || !userData?.user) {
      return res.status(401).json({
        error: "Пользователь не найден"
      });
    }

    const username =
      userData.user.user_metadata?.username ||
      userData.user.email?.split("@")[0] ||
      "Пользователь";

    const { data, error } = await supabaseStorage
      .from("video_comments")
      .insert({
        user_id: userId,
        video_path: videoPath,
        username: username,
        comment: comment.trim()
      })
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});
app.get("/api/videos/comments", async (req, res) => {
  try {
    const videoPath = req.query.videoPath;

    if (
      typeof videoPath !== "string" ||
      !videoPath.trim() ||
      videoPath.length > 500
    ) {
      return res.status(400).json({
        error: "Неверное видео"
      });
    }

    const { data, error } = await supabaseStorage
      .from("video_comments")
      .select("id, username, comment, created_at")
      .eq("video_path", videoPath)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});
app.listen(PORT, "0.0.0.0", () => {
  console.log(`ClipFlow 2.0 запущен на порту ${PORT}`);
});
