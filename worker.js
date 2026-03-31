export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method === 'POST') {
      try {
        // 验证用户 token
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const token = authHeader.replace('Bearer ', '');
        const userData = JSON.parse(atob(token.split('.')[1]));
        
        // 保存或更新用户信息
        await env.DB.prepare(
          `INSERT INTO users (google_id, email, name, picture, last_login) 
           VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(google_id) DO UPDATE SET last_login = CURRENT_TIMESTAMP`
        ).bind(userData.sub, userData.email, userData.name, userData.picture).run();

        const user = await env.DB.prepare(
          'SELECT id FROM users WHERE google_id = ?'
        ).bind(userData.sub).first();

        const formData = await request.formData();
        const imageFile = formData.get('image');
        
        if (!imageFile) {
          return new Response(JSON.stringify({ error: 'No image provided' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // 记录使用次数
        await env.DB.prepare(
          'INSERT INTO usage_logs (user_id) VALUES (?)'
        ).bind(user.id).run();

        const removeBgFormData = new FormData();
        removeBgFormData.append('image_file', imageFile);
        removeBgFormData.append('size', 'auto');

        const response = await fetch('https://api.remove.bg/v1.0/removebg', {
          method: 'POST',
          headers: { 'X-Api-Key': env.REMOVE_BG_API_KEY },
          body: removeBgFormData,
        });

        if (!response.ok) {
          const error = await response.text();
          return new Response(JSON.stringify({ error }), {
            status: response.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const imageBuffer = await response.arrayBuffer();
        
        return new Response(imageBuffer, {
          headers: { ...corsHeaders, 'Content-Type': 'image/png' },
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response('Method not allowed', { status: 405 });
  },
};
