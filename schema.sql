-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  picture TEXT,
  credits INTEGER DEFAULT 3,
  free_credits_granted INTEGER DEFAULT 1,
  subscription_plan TEXT DEFAULT 'free',
  subscription_credits_used INTEGER DEFAULT 0,
  subscription_reset_date DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 使用记录表
CREATE TABLE IF NOT EXISTS usage_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT DEFAULT 'usage',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 积分交易记录表
CREATE TABLE IF NOT EXISTS credit_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL, -- signup_bonus / purchase / usage / subscription
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_usage_user_id ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON credit_transactions(user_id);
