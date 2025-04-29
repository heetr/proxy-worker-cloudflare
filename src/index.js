const partyIdCache = new Map();

// Hàm kiểm tra định dạng UUID (tùy chọn)
function isValidUUID(str) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const hostname = url.hostname;
  
  // Kiểm tra header X-Party-Id từ client
  let partyId = request.headers.get('X-Party-Id');
  let partyIdSource = 'header';
  
  // Validate partyId nếu bật VALIDATE_PARTY_ID
  if (partyId && VALIDATE_PARTY_ID === "true" && !isValidUUID(partyId)) {
    console.error('Invalid X-Party-Id format:', partyId);
    return new Response('Invalid X-Party-Id', { status: 400 });
  }

  // Fallback tới KV nếu không có header X-Party-Id
  if (!partyId) {
    partyIdSource = 'kv';
    partyId = partyIdCache.get(hostname);
    if (!partyId) {
      try {
        partyId = await DOMAIN_PARTY_ID_MAPPING.get(hostname);
        if (partyId) partyIdCache.set(hostname, partyId);
      } catch (error) {
        console.error('KV error:', error);
        return new Response('Internal Server Error', { status: 500 });
      }
    }
  }
  
  if (!partyId) {
    console.error('Domain not found in KV:', hostname);
    return new Response("Domain not configured", { status: 404 });
  }

  const targetBase = TARGET_BASE || "https://refactor.d2s3bo1qpvtzn8.amplifyapp.com";
  let targetPath = url.pathname;
  
  // Chuẩn hóa pathname để bỏ trailing slash nếu cần
  if (targetPath.endsWith('/') && targetPath !== '/') {
    targetPath = targetPath.slice(0, -1);
  }
  const targetUrl = new URL(targetPath, targetBase);

  // Chuyển tiếp tất cả query parameters nguyên vẹn
  for (const [key, value] of url.searchParams) {
    targetUrl.searchParams.set(key, value);
  }

  if (DEBUG === "true") {
    console.log('Request URL:', request.url);
    console.log('Target URL:', targetUrl.toString());
    console.log(`Party-Id: ${partyId} (Source: ${partyIdSource})`);
  }

  // Thêm header X-Party-Id và User-Agent
  const headers = new Headers(request.headers);
  headers.set('User-Agent', 'Cloudflare-Worker');
  headers.set('X-Party-Id', partyId);

  // Giới hạn redirect để ngăn loop
  const maxRedirects = 5;
  let redirectCount = 0;
  let currentUrl = targetUrl;
  let response;

  while (redirectCount < maxRedirects) {
    try {
      response = await fetch(currentUrl, {
        method: request.method,
        headers: headers,
        body: request.body,
        redirect: 'manual'
      });
      
      if (DEBUG === "true") {
        console.log('Response status:', response.status);
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('Location');
        if (location) {
          const newLocation = new URL(location, targetBase);
          // Chuẩn hóa newLocation để bỏ trailing slash
          if (newLocation.pathname.endsWith('/') && newLocation.pathname !== '/') {
            newLocation.pathname = newLocation.pathname.slice(0, -1);
          }
          if (DEBUG === "true") {
            console.log('Redirect to:', newLocation.toString());
          }
          currentUrl = newLocation;
          redirectCount++;
          continue;
        }
      }
      break;
    } catch (error) {
      console.error('Fetch error:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }

  if (redirectCount >= maxRedirects) {
    console.error('Too many redirects');
    return new Response('Too many redirects', { status: 508 });
  }

  return response;
}