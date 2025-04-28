var domainToPartyId = {
  "servtech.site": "e9fb0a18-8921-46ad-b461-46abb15c1bb8",
  "www.servtech.site": "e9fb0a18-8921-46ad-b461-46abb15c1bb8"
};

// Danh sách endpoint không cần partyId
const noPartyIdEndpoints = [
  '/images',
  '/monitoring',
  '/api',
  // Thêm các endpoint khác nếu cần, ví dụ: '/static', '/assets'
];

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const hostname = url.hostname;
  const partyId = domainToPartyId[hostname];
  if (!partyId) {
    console.log('Domain not found:', hostname);
    return new Response("Domain not configured", { status: 404 });
  }

  const targetBase = "https://refactor.d2s3bo1qpvtzn8.amplifyapp.com";
  let targetPath = url.pathname;
  
  // Chuẩn hóa pathname để bỏ trailing slash nếu cần
  if (targetPath.endsWith('/') && targetPath !== '/') {
    targetPath = targetPath.slice(0, -1);
  }
  const targetUrl = new URL(targetPath, targetBase);

  // Chuyển tiếp query parameters
  const isApiEndpoint = noPartyIdEndpoints.some(endpoint => url.pathname.startsWith(endpoint));
  for (const [key, value] of url.searchParams) {
    if (isApiEndpoint) {
      // Giữ query gốc cho /api/*
      targetUrl.searchParams.set(key, value);
    } else {
      // Loại bỏ partyId/party_id cho các endpoint khác
      if (key !== 'partyId' && key !== 'party_id') {
        targetUrl.searchParams.set(key, value);
      }
    }
  }

  console.log('Request URL:', request.url); // Debug
  console.log('Target URL:', targetUrl.toString()); // Debug

  // Gửi X-Party-Id cho các endpoint không thuộc noPartyIdEndpoints
  const needsPartyId = !isApiEndpoint;
  const headers = {
    ...request.headers,
    'User-Agent': 'Cloudflare-Worker'
  };
  if (needsPartyId) {
    headers['X-Party-Id'] = partyId;
  }

  // Giới hạn redirect để ngăn loop
  const maxRedirects = 5;
  let redirectCount = 0;
  let currentUrl = targetUrl;
  let response;

  while (redirectCount < maxRedirects) {
    response = await fetch(currentUrl, {
      method: request.method,
      headers: headers,
      body: request.body,
      redirect: 'manual' // Không tự động theo redirect
    });
    console.log('Response status:', response.status); // Debug

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('Location');
      if (location) {
        const newLocation = new URL(location, targetBase);
        // Chuẩn hóa newLocation để bỏ trailing slash
        if (newLocation.pathname.endsWith('/') && newLocation.pathname !== '/') {
          newLocation.pathname = newLocation.pathname.slice(0, -1);
        }
        if (!isApiEndpoint) {
          newLocation.searchParams.delete('partyId');
          newLocation.searchParams.delete('party_id');
        }
        console.log('Redirect to:', newLocation.toString()); // Debug
        currentUrl = newLocation;
        redirectCount++;
        continue;
      }
    }
    break;
  }

  if (redirectCount >= maxRedirects) {
    console.log('Too many redirects');
    return new Response('Too many redirects', { status: 508 });
  }

  return response;
}