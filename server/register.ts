import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config(); // Load env variables

const router = Router();

// 🔐 Initialize Supabase client with secrets
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ✅ POST /api/register — user signup + admin setup
router.post("/api/register", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  // 🧠 Check if this is the first user
  const { data: existingUsers, error: fetchError } = await supabase
    .from("users")
    .select("id");

  if (fetchError) {
    return res.status(500).json({ message: "Failed to check existing users." });
  }

  const isAdmin = existingUsers.length === 0;

  // 🔐 Register user in Supabase Auth
  const { data: authUser, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authError) {
    return res.status(400).json({ message: authError.message });
  }

  // 📝 Save user info to 'users' table
  const { error: insertError } = await supabase.from("users").insert([
    {
      email,
      isAdmin,
      created_at: new Date(),
    },
  ]);

  if (insertError) {
    return res.status(500).json({ message: insertError.message });
  }

  return res.status(200).json({
    message: "User registered successfully.",
    isAdmin,
  });
});

export default router;