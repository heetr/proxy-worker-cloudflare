var domainToPartyId = {
  "servtech.site": "7f226ba9-de63-4f6d-9e38-332267c8cdf8",
  "www.servtech.site": "7f226ba9-de63-4f6d-9e38-332267c8cdf8"
};

// Danh sách endpoint không cần partyId
const noPartyIdEndpoints = [
  '/images',
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

  // Chuyển tiếp tất cả query parameters gốc từ client
  for (const [key, value] of url.searchParams) {
    targetUrl.searchParams.set(key, value);
  }

  // Thêm partyId cho các endpoint cần, không ghi đè query gốc
  const needsPartyId = !noPartyIdEndpoints.some(endpoint => url.pathname.startsWith(endpoint));
  if (needsPartyId && !targetUrl.searchParams.has('partyId')) {
    targetUrl.searchParams.set("partyId", partyId);
  }

  console.log('Request URL:', request.url); // Debug
  console.log('Target URL:', targetUrl.toString()); // Debug

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: {
        ...request.headers,
        'User-Agent': 'Cloudflare-Worker' // Tránh bị chặn
      },
      body: request.body
    });
    console.log('Response status:', response.status); // Debug

    // Xử lý redirect để ẩn partyId trong Location
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('Location');
      if (location) {
        const newLocation = new URL(location, targetBase);
        newLocation.searchParams.delete('partyId'); // Xóa partyId khỏi redirect URL
        const newResponse = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
        newResponse.headers.set('Location', newLocation.toString());
        return newResponse;
      }
    }

    return response;
  } catch (error) {
    console.log('Fetch error:', error.message); // Debug
    return new Response('Error fetching target: ' + error.message, { status: 500 });
  }
}