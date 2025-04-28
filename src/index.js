var domainToPartyId = {
  "servtech.site": "e9fb0a18-8921-46ad-b461-46abb15c1bb8",
  "www.servtech.site": "e9fb0a18-8921-46ad-b461-46abb15c1bb8"
};

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

  // Chuyển tiếp tất cả query parameters nguyên vẹn
  for (const [key, value] of url.searchParams) {
    targetUrl.searchParams.set(key, value);
  }

  console.log('Request URL:', request.url);
  console.log('Target URL:', targetUrl.toString());

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
      console.log('Response status:', response.status);

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('Location');
        if (location) {
          const newLocation = new URL(location, targetBase);
          // Chuẩn hóa newLocation để bỏ trailing slash
          if (newLocation.pathname.endsWith('/') && newLocation.pathname !== '/') {
            newLocation.pathname = newLocation.pathname.slice(0, -1);
          }
          console.log('Redirect to:', newLocation.toString());
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
    console.log('Too many redirects');
    return new Response('Too many redirects', { status: 508 });
  }

  return response;
}