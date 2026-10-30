
/**
 * DJ API Proxy
 *
 * 访问方式：
 * https://你的域名.vercel.app/api/?id=140739
 *
 * 调试方式：
 * https://你的域名.vercel.app/api/?id=140739&debug=1
 *
 * 特点：
 * 1. 每次请求实时访问 DJ 上游接口
 * 2. 不使用缓存
 * 3. 随机生成请求头中的 IP 字段
 * 4. 支持 debug 调试
 * 5. 上游请求超时控制
 */

const TARGET_API =
  'https://www.dj.net/template/zhzh_dzmusic/ajax/';

const REFERER =
  'https://www.dj.net/';

// 随机生成 IPv4 地址，仅作为请求头中的普通字段。
// 注意：这不会改变 Vercel 服务器的真实出口 IP。
function getRandomIP() {
  return [
    Math.floor(Math.random() * 223) + 1,
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 254) + 1
  ].join('.');
}

// 统一输出 JSON
function sendJSON(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.end(JSON.stringify(data));
}

export default async function handler(req, res) {
  const startTime = Date.now();

  // 不使用缓存
  res.setHeader(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate'
  );
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    // 只允许 GET
    if (req.method !== 'GET') {
      return sendJSON(res, 405, {
        success: false,
        error: 'Method Not Allowed'
      });
    }

    // 解析请求 URL
    const host = req.headers.host || 'localhost';

    const url = new URL(
      req.url || '/',
      `https://${host}`
    );

    // 获取参数
    const id = url.searchParams.get('id');
    const debug = url.searchParams.get('debug') === '1';

    // 检查 ID
    if (!id || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) {
      return sendJSON(res, 400, {
        success: false,
        error: 'Invalid or missing id'
      });
    }

    // 生成随机 IP
    const randomIP = getRandomIP();

    // 构建上游 URL
    const targetUrl = new URL(TARGET_API);
    targetUrl.searchParams.set('action', 'geturl');
    targetUrl.searchParams.set('id', id);

    // 上游请求头
    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',

      'Referer': REFERER,
      'Accept': '*/*',

      // 以下是普通请求头，不会改变服务器真实出口 IP
      'X-Forwarded-For': randomIP,
      'X-Real-IP': randomIP,
      'Client-IP': randomIP,
      'True-Client-IP': randomIP
    };

    console.log(JSON.stringify({
      event: 'request_start',
      id,
      targetUrl: targetUrl.toString(),
      randomIP,
      time: new Date().toISOString()
    }));

    // 上游请求，20 秒超时
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 20000);

    let upstream;

    const fetchStart = Date.now();

    try {
      upstream = await fetch(targetUrl.toString(), {
        method: 'GET',
        headers,
        signal: controller.signal,
        cache: 'no-store',
        redirect: 'follow'
      });
    } finally {
      clearTimeout(timeout);
    }

    const upstreamMs = Date.now() - fetchStart;

    // 读取上游返回内容
    const buffer = Buffer.from(
      await upstream.arrayBuffer()
    );

    const contentType =
      upstream.headers.get('content-type') ||
      'application/octet-stream';

    const totalMs = Date.now() - startTime;

    console.log(JSON.stringify({
      event: 'request_complete',
      id,
      upstreamStatus: upstream.status,
      contentType,
      bodyLength: buffer.length,
      upstreamMs,
      totalMs
    }));

    // 调试模式：返回详细信息
    if (debug) {
      const preview = buffer
        .toString('utf8')
        .substring(0, 1000);

      return sendJSON(res, 200, {
        success: upstream.ok,
        requestTime: new Date().toISOString(),
        id,
        targetUrl: targetUrl.toString(),
        randomIP,

        upstream: {
          status: upstream.status,
          statusText: upstream.statusText,
          contentType,
          contentLength: buffer.length
        },

        timing: {
          upstreamMs,
          totalMs
        },

        body: {
          length: buffer.length,
          preview
        },

        note: '随机 IP 仅设置在请求头中，不会改变 Vercel 的真实出口 IP。'
      });
    }

    // 正常模式：原样返回上游响应
    res.statusCode = upstream.status;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', buffer.length);

    res.end(buffer);

  } catch (error) {
    console.error('DJ Proxy Error:', error);

    const isTimeout =
      error.name === 'AbortError';

    return sendJSON(res, 502, {
      success: false,
      error: isTimeout
        ? 'Upstream request timeout'
        : error.message || 'Proxy request failed',

      errorName: error.name || 'Error',

      cause: error.cause
        ? {
            code: error.cause.code,
            message: error.cause.message
          }
        : null,

      totalMs: Date.now() - startTime
    });
  }
}
