// PayPal 套餐配置
const CREDIT_PACKS = {
  pack_15:  { credits: 15,  price: '1.99', description: '15 Credits Pack' },
  pack_50:  { credits: 50,  price: '4.99', description: '50 Credits Pack' },
  pack_120: { credits: 120, price: '9.99', description: '120 Credits Pack' },
};

const SUBSCRIPTION_PLANS = {
  starter: { credits: 50,  price: '4.99',  description: 'Starter Plan - 50 credits/month' },
  pro:     { credits: 150, price: '9.99',  description: 'Pro Plan - 150 credits/month' },
  team:    { credits: 500, price: '24.99', description: 'Team Plan - 500 credits/month' },
};

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

    // GET /api/user/credits
    if (request.method === 'GET' && url.pathname === '/api/user/credits') {
      return handleGetCredits(request, env, corsHeaders);
    }

    // POST /api/remove-bg
    if (request.method === 'POST' && (url.pathname === '/' || url.pathname === '/api/remove-bg')) {
      return handleRemoveBg(request, env, corsHeaders);
    }

    // POST /api/paypal/create-order - 创建一次性积分包订单
    if (request.method === 'POST' && url.pathname === '/api/paypal/create-order') {
      return handleCreateOrder(request, env, corsHeaders);
    }

    // POST /api/paypal/capture-order - 捕获/完成订单
    if (request.method === 'POST' && url.pathname === '/api/paypal/capture-order') {
      return handleCaptureOrder(request, env, corsHeaders);
    }

    // POST /api/paypal/create-subscription - 创建订阅
    if (request.method === 'POST' && url.pathname === '/api/paypal/create-subscription') {
      return handleCreateSubscription(request, env, corsHeaders);
    }

    // POST /api/paypal/subscription-webhook - PayPal 订阅回调
    if (request.method === 'POST' && url.pathname === '/api/paypal/subscription-webhook') {
      return handleSubscriptionWebhook(request, env, corsHeaders);
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

// ==================== PayPal 工具函数 ====================

async function getPayPalAccessToken(env) {
  const baseUrl = env.PAYPAL_MODE === 'sandbox'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';

  const auth = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`);
  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  return { token: data.access_token, baseUrl };
}

// ==================== 一次性积分包支付 ====================

async function handleCreateOrder(request, env, corsHeaders) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders);

    const body = await request.json();
    const { packId } = body;
    const pack = CREDIT_PACKS[packId];
    if (!pack) return jsonResponse({ error: 'Invalid pack' }, 400, corsHeaders);

    const { token, baseUrl } = await getPayPalAccessToken(env);

    const order = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: { currency_code: 'USD', value: pack.price },
          description: pack.description,
          custom_id: packId,
        }],
        application_context: {
          brand_name: 'Background Remover',
          user_action: 'PAY_NOW',
          return_url: 'https://image-background-remover.shop/?payment=success',
          cancel_url: 'https://image-background-remover.shop/?payment=cancelled',
        },
      }),
    });

    const orderData = await order.json();
    return jsonResponse({ orderId: orderData.id }, 200, corsHeaders);
  } catch (e) {
    return jsonResponse({ error: e.message }, 500, corsHeaders);
  }
}

async function handleCaptureOrder(request, env, corsHeaders) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders);

    const token_str = authHeader.replace('Bearer ', '');
    const userData = JSON.parse(atob(token_str.split('.')[1]));
    const user = await getOrCreateUser(env, userData);

    const body = await request.json();
    const { orderId } = body;

    const { token, baseUrl } = await getPayPalAccessToken(env);

    // 先查询订单
    const orderRes = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const orderData = await orderRes.json();

    if (orderData.status === 'COMPLETED') {
      return jsonResponse({ error: 'Order already captured' }, 400, corsHeaders);
    }

    // 捕获支付
    const captureRes = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const captureData = await captureRes.json();

    if (captureData.status !== 'COMPLETED') {
      return jsonResponse({ error: 'Payment failed', details: captureData }, 400, corsHeaders);
    }

    // 检查是否重复处理
    const existing = await env.DB.prepare(
      "SELECT id FROM credit_transactions WHERE type='purchase' AND note LIKE ?"
    ).bind(`%${orderId}%`).first();
    if (existing) {
      return jsonResponse({ error: 'Order already processed' }, 400, corsHeaders);
    }

    // 找出购买的套餐
    const packId = orderData.purchase_units[0]?.custom_id;
    const pack = CREDIT_PACKS[packId];
    if (!pack) return jsonResponse({ error: 'Invalid pack in order' }, 400, corsHeaders);

    // 充值积分
    await env.DB.prepare(
      'UPDATE users SET credits = credits + ? WHERE id = ?'
    ).bind(pack.credits, user.id).run();

    await env.DB.prepare(
      `INSERT INTO credit_transactions (user_id, amount, type, note)
       VALUES (?, ?, 'purchase', ?)`
    ).bind(user.id, pack.credits, `PayPal order ${orderId} - ${pack.description}`).run();

    const updated = await env.DB.prepare('SELECT credits FROM users WHERE id = ?').bind(user.id).first();
    return jsonResponse({ success: true, credits: updated.credits, added: pack.credits }, 200, corsHeaders);
  } catch (e) {
    return jsonResponse({ error: e.message }, 500, corsHeaders);
  }
}

// ==================== 订阅支付 ====================

async function handleCreateSubscription(request, env, corsHeaders) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders);

    const body = await request.json();
    const { planId } = body;
    const plan = SUBSCRIPTION_PLANS[planId];
    if (!plan) return jsonResponse({ error: 'Invalid plan' }, 400, corsHeaders);

    const { token, baseUrl } = await getPayPalAccessToken(env);

    // 创建 PayPal billing plan
    const planRes = await fetch(`${baseUrl}/v1/billing/plans`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        product_id: await ensurePayPalProduct(token, baseUrl),
        name: plan.description,
        description: plan.description,
        status: 'ACTIVE',
        billing_cycles: [{
          frequency: { interval_unit: 'MONTH', interval_count: 1 },
          tenure_type: 'REGULAR',
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: {
            fixed_price: { value: plan.price, currency_code: 'USD' },
          },
        }],
        payment_preferences: {
          auto_bill_outstanding: true,
          setup_fee: { value: '0', currency_code: 'USD' },
          setup_fee_failure_action: 'CONTINUE',
          payment_failure_threshold: 3,
        },
      }),
    });
    const planData = await planRes.json();

    // 创建订阅
    const subRes = await fetch(`${baseUrl}/v1/billing/subscriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        plan_id: planData.id,
        custom_id: planId,
        application_context: {
          brand_name: 'Background Remover',
          user_action: 'SUBSCRIBE_NOW',
          return_url: 'https://image-background-remover.shop/?subscription=success',
          cancel_url: 'https://image-background-remover.shop/?subscription=cancelled',
        },
      }),
    });
    const subData = await subRes.json();

    const approveLink = subData.links?.find(l => l.rel === 'approve')?.href;
    return jsonResponse({ subscriptionId: subData.id, approveUrl: approveLink }, 200, corsHeaders);
  } catch (e) {
    return jsonResponse({ error: e.message }, 500, corsHeaders);
  }
}

async function ensurePayPalProduct(token, baseUrl) {
  // 创建或复用产品
  const res = await fetch(`${baseUrl}/v1/catalogs/products`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({
      name: 'Background Remover Credits',
      description: 'AI Background Removal Service',
      type: 'SERVICE',
      category: 'SOFTWARE',
    }),
  });
  const data = await res.json();
  return data.id;
}

// ==================== 订阅 Webhook ====================

async function handleSubscriptionWebhook(request, env, corsHeaders) {
  try {
    const event = await request.json();
    const eventType = event.event_type;

    if (eventType === 'BILLING.SUBSCRIPTION.ACTIVATED' || eventType === 'PAYMENT.SALE.COMPLETED') {
      const subscriptionId = event.resource?.id || event.resource?.billing_agreement_id;
      const customId = event.resource?.custom_id || event.resource?.plan_id;
      const plan = SUBSCRIPTION_PLANS[customId];

      if (plan && subscriptionId) {
        // 查找用户（通过订阅ID匹配）
        const user = await env.DB.prepare(
          'SELECT * FROM users WHERE subscription_plan = ?'
        ).bind(subscriptionId).first();

        if (user) {
          const now = new Date();
          const resetDate = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
          await env.DB.prepare(
            `UPDATE users SET credits = credits + ?, subscription_plan = ?, subscription_reset_date = ? WHERE id = ?`
          ).bind(plan.credits, customId, resetDate.toISOString().split('T')[0], user.id).run();

          await env.DB.prepare(
            `INSERT INTO credit_transactions (user_id, amount, type, note) VALUES (?, ?, 'subscription', ?)`
          ).bind(user.id, plan.credits, `Monthly subscription renewal - ${plan.description}`).run();
        }
      }
    }

    return jsonResponse({ received: true }, 200, corsHeaders);
  } catch (e) {
    return jsonResponse({ error: e.message }, 500, corsHeaders);
  }
}
