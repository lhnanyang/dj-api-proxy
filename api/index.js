
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

// 随机生成 Cloudflare 网段 IP 参数
function getRandomCFIP() {
  const cidr = CF_CIDRS[
    Math.floor(Math.random() * CF_CIDRS.length)
  ];

  const [ip, mask] = cidr.split('/');
  const parts = ip.split('.').map(Number);

  const start = (
    parts[0] * 16777216 +
    parts[1] * 65536 +
    parts[2] * 256 +
    parts[3]
  );

  const count = 2 ** (32 - Number(mask));
  const offset = Math.floor(Math.random() * (count - 2)) + 1;

  const result = start + offset;

  return [
    Math.floor(result / 16777216) & 255,
    Math.floor(result / 65536) & 255,
    Math.floor(result / 256) & 255,
    result & 255
  ].join('.');
}

export default async function handler(request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) {
      return new Response('Invalid id', { status: 400 });
    }

    const randomIP = getRandomCFIP();

    const targetUrl =
      'https://www.dj.net/template/zhzh_dzmusic/ajax/?action=geturl&id='
      + encodeURIComponent(id);

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Referer': 'https://www.dj.net/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'X-Forwarded-For': randomIP,
        'X-Real-IP': randomIP,
        'Client-IP': randomIP,
        'True-Client-IP': randomIP
      },
      signal: AbortSignal.timeout(20000),
      cache: 'no-store'
    });

    const data = await response.arrayBuffer();

    return new Response(data, {
      status: response.status,
      headers: {
        'Content-Type':
          response.headers.get('content-type') ||
          'application/octet-stream',
        'Cache-Control': 'no-store'
      }
    });

  } catch (error) {
    return Response.json({
      error: 'Request failed',
      message: error.message
    }, { status: 502 });
  }
}
