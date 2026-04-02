export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // GET /api/user/credits - 查询用户积分信息
    if (request.method === 'GET' && url.pathname === '/api/user/credits') {
      return handleGetCredits(request, env, corsHeaders);
    }

    // POST /api/remove-bg - 主处理接口
    if (request.method === 'POST' && (url.pathname === '/' || url.pathname === '/api/remove-bg')) {
      return handleRemoveBg(request, env, corsHeaders);
    }

    return new Response('Not found', { status: 404 });
  },
};

async function getOrCreateUser(env, userData) {
  // 尝试获取已有用户
  let user = await env.DB.prepare(
    'SELECT * FROM users WHERE google_id = ?'
  ).bind(userData.sub).first();

  if (!user) {
    // 新用户：创建账号，赠送 3 次免费额度
    await env.DB.prepare(
      `INSERT INTO users (google_id, email, name, picture, credits, free_credits_granted, last_login)
       VALUES (?, ?, ?, ?, 3, 1, CURRENT_TIMESTAMP)`
    ).bind(userData.sub, userData.email, userData.name, userData.picture).run();

    user = await env.DB.prepare(
      'SELECT * FROM users WHERE google_id = ?'
    ).bind(userData.sub).first();

    // 记录赠送交易
    await env.DB.prepare(
      `INSERT INTO credit_transactions (user_id, amount, type, note)
       VALUES (?, 3, 'signup_bonus', 'Welcome gift - 3 free credits')`
    ).bind(user.id).run();
  } else {
    // 更新登录时间
    await env.DB.prepare(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(user.id).run();
  }

  return user;
}

async function handleGetCredits(request, env, corsHeaders) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders);
    }

    const token = authHeader.replace('Bearer ', '');
    const userData = JSON.parse(atob(token.split('.')[1]));
    const user = await getOrCreateUser(env, userData);

    return jsonResponse({
      credits: user.credits,
      subscription_plan: user.subscription_plan,
      subscription_credits_used: user.subscription_credits_used,
      subscription_reset_date: user.subscription_reset_date,
      is_new_user: false,
    }, 200, corsHeaders);
  } catch (error) {
    return jsonResponse({ error: error.message }, 500, corsHeaders);
  }
}

async function handleRemoveBg(request, env, corsHeaders) {
  try {
    // 验证用户 token
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401, corsHeaders);
    }

    const token = authHeader.replace('Bearer ', '');
    const userData = JSON.parse(atob(token.split('.')[1]));

    // 获取或创建用户
    const user = await getOrCreateUser(env, userData);

    // 检查积分余额
    if (user.credits <= 0) {
      return jsonResponse({
        error: 'No credits remaining',
        code: 'NO_CREDITS',
        credits: 0,
        message: "You've used all your credits. Please upgrade to continue.",
      }, 402, corsHeaders);
    }

    const formData = await request.formData();
    const imageFile = formData.get('image');

    if (!imageFile) {
      return jsonResponse({ error: 'No image provided' }, 400, corsHeaders);
    }

    // 先扣积分（防止并发重复消耗）
    await env.DB.prepare(
      'UPDATE users SET credits = credits - 1 WHERE id = ? AND credits > 0'
    ).bind(user.id).run();

    // 记录使用日志
    await env.DB.prepare(
      'INSERT INTO usage_logs (user_id, type) VALUES (?, ?)'
    ).bind(user.id, 'usage').run();

    // 记录积分交易
    await env.DB.prepare(
      `INSERT INTO credit_transactions (user_id, amount, type, note)
       VALUES (?, -1, 'usage', 'Background removal')`
    ).bind(user.id).run();

    // 调用 remove.bg API
    const removeBgFormData = new FormData();
    removeBgFormData.append('image_file', imageFile);
    removeBgFormData.append('size', 'auto');

    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': env.REMOVE_BG_API_KEY },
      body: removeBgFormData,
    });

    if (!response.ok) {
      // API 失败，退还积分
      await env.DB.prepare(
        'UPDATE users SET credits = credits + 1 WHERE id = ?'
      ).bind(user.id).run();
      await env.DB.prepare(
        `INSERT INTO credit_transactions (user_id, amount, type, note)
         VALUES (?, 1, 'refund', 'API error refund')`
      ).bind(user.id).run();

      const error = await response.text();
      return jsonResponse({ error }, response.status, corsHeaders);
    }

    const imageBuffer = await response.arrayBuffer();

    // 获取最新积分余额
    const updatedUser = await env.DB.prepare(
      'SELECT credits FROM users WHERE id = ?'
    ).bind(user.id).first();

    return new Response(imageBuffer, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'image/png',
        'X-Credits-Remaining': String(updatedUser.credits),
      },
    });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500, corsHeaders);
  }
}

function jsonResponse(data, status, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
