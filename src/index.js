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
  const targetUrl = new URL(url.pathname, targetBase);

  // Chuyển tiếp tất cả query parameters gốc
  for (const [key, value] of url.searchParams) {
    targetUrl.searchParams.set(key, value);
  }

  console.log('Request URL:', request.url); // Debug
  console.log('Target URL:', targetUrl.toString()); // Debug

  // Gửi X-Party-Id cho các endpoint cần
  const needsPartyId = !noPartyIdEndpoints.some(endpoint => url.pathname.startsWith(endpoint));
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
        // Không xóa partyId để giữ query gốc cho /api/*
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