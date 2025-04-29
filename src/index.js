const partyIdCache = new Map();

// Hàm kiểm tra định dạng UUID
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
  
  // Lấy partyId từ KV để so sánh hoặc xác nhận domain hợp lệ
  let kvPartyId = partyIdCache.get(hostname);
  if (!kvPartyId) {
    try {
      kvPartyId = await DOMAIN_PARTY_ID_MAPPING.get(hostname);
      if (kvPartyId) partyIdCache.set(hostname, kvPartyId);
    } catch (error) {
      console.error('KV error:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }
  
  if (!kvPartyId) {
    console.error('Domain not found in KV:', hostname);
    return new Response("Domain not configured", { status: 404 });
  }

  // Kiểm tra header X-Party-Id từ client
  const clientPartyId = request.headers.get('X-Party-Id');
  let partyIdSource = clientPartyId ? 'header' : 'none';
  
  // Nếu client gửi X-Party-Id, so sánh với KV
  if (clientPartyId) {
    if (VALIDATE_PARTY_ID === "true" && !isValidUUID(clientPartyId)) {
      console.error('Invalid X-Party-Id format:', clientPartyId);
      return new Response('Invalid X-Party-Id', { status: 400 });
    }
    if (clientPartyId !== kvPartyId) {
      console.error('X-Party-Id does not match KV value:', clientPartyId, kvPartyId);
      return new Response('Unauthorized X-Party-Id', { status: 403 });
    }
  }

  const targetBase = TARGET_BASE || "https://generic-shop.bookingcampus.com";
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
    console.log(`Party-Id: ${clientPartyId || 'none'} (Source: ${partyIdSource})`);
  }

  // Sao chép header từ client, chỉ ghi đè User-Agent
  const headers = new Headers(request.headers);
  headers.set('User-Agent', 'Cloudflare-Worker');

  // Gửi request tới backend
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