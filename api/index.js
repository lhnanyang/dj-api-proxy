
const CF_CIDRS = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22'
];

// 随机生成 IP 参数，同时记录网段
function getRandomCFIP() {
  const cidr = CF_CIDRS[
    Math.floor(Math.random() * CF_CIDRS.length)
  ];

  const [ip, mask] = cidr.split('/');
  const parts = ip.split('.').map(Number);

  const start =
    parts[0] * 16777216 +
    parts[1] * 65536 +
    parts[2] * 256 +
    parts[3];

  const count = 2 ** (32 - Number(mask));
  const offset = Math.floor(Math.random() * (count - 2)) + 1;
  const result = start + offset;

  const randomIP = [
    Math.floor(result / 16777216) & 255,
    Math.floor(result / 65536) & 255,
    Math.floor(result / 256) & 255,
    result & 255
  ].join('.');

  return { ip: randomIP, cidr };
}

export default async function handler(request) {
  const startTime = Date.now();
  const requestTime = new Date().toISOString();

  let targetUrl = '';
  let randomIP = null;
  let cidr = null;

  const url = new URL(
  request.url,
  `https://${request.headers.get('host') || 'localhost'}`
);
  const id = url.searchParams.get('id');
  const debug = url.searchParams.get('debug') === '1';

  const log = (event, details = {}) => {
    console.log(JSON.stringify({
      time: new Date().toISOString(),
      event,
      id,
      ...details
    }));
  };

  log('REQUEST_START', {
    method: request.method,
    debug,
    requestTime
  });

  if (request.method !== 'GET') {
    return Response.json({
      error: 'Method not allowed'
    }, { status: 405 });
  }

  if (!id || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) {
    return Response.json({
      error: 'Invalid id',
      received_id: id
    }, { status: 400 });
  }

  try {
    const generated = getRandomCFIP();

    randomIP = generated.ip;
    cidr = generated.cidr;

    targetUrl =
      'https://www.dj.net/template/zhzh_dzmusic/ajax/?action=geturl&id='
      + encodeURIComponent(id);

    log('UPSTREAM_REQUEST', {
      targetUrl,
      randomIP,
      cidr
    });

    const fetchStart = Date.now();

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Referer': 'https://www.dj.net/',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'X-Forwarded-For': randomIP,
        'X-Real-IP': randomIP,
        'Client-IP': randomIP,
        'True-Client-IP': randomIP
      },
      signal: AbortSignal.timeout(20000),
      cache: 'no-store'
    });

    const fetchTime = Date.now() - fetchStart;

    log('UPSTREAM_RESPONSE', {
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type'),
      fetchTime
    });

    const data = await response.arrayBuffer();

    const totalTime = Date.now() - startTime;

    log('REQUEST_SUCCESS', {
      upstreamStatus: response.status,
      bodyLength: data.byteLength,
      totalTime
    });

    // 诊断模式：返回详细 JSON
    if (debug) {
      const preview = new TextDecoder().decode(data);

      return Response.json({
        success: response.ok,
        requestTime,
        id,
        targetUrl,
        randomIP,
        cidr,

        upstream: {
          status: response.status,
          statusText: response.statusText,
          contentType: response.headers.get('content-type'),
          contentLength: response.headers.get('content-length')
        },

        timing: {
          upstreamMs: fetchTime,
          totalMs: totalTime
        },

        body: {
          length: data.byteLength,
          preview: preview.substring(0, 2000)
        },

        note: 'randomIP is only a request header value, not the actual outbound IP.'
      }, {
        status: 200,
        headers: {
          'Cache-Control': 'no-store'
        }
      });
    }

    // 普通模式：原样返回上游数据
    const headers = new Headers();

    headers.set(
      'Content-Type',
      response.headers.get('content-type') ||
      'application/octet-stream'
    );

    headers.set('Cache-Control', 'no-store');

    return new Response(data, {
      status: response.status,
      headers
    });

  } catch (error) {
    const totalTime = Date.now() - startTime;

    log('REQUEST_ERROR', {
      errorName: error.name,
      errorMessage: error.message,
      cause: error.cause?.message || null,
      totalTime,
      randomIP,
      cidr
    });

    return Response.json({
      success: false,
      error: error.name,
      message: error.message,
      cause: error.cause?.message || null,

      id,
      targetUrl,
      randomIP,
      cidr,

      timing: {
        totalMs: totalTime
      }
    }, {
      status: 502,
      headers: {
        'Cache-Control': 'no-store'
      }
    });
  }
}
