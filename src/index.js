var domainToPartyId = {
  "servtech.site": "7f226ba9-de63-4f6d-9e38-332267c8cdf8",
  "www.servtech.site": "7f226ba9-de63-4f6d-9e38-332267c8cdf8" // Thêm để hỗ trợ www
};

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const hostname = url.hostname;
  console.log('Request URL:', request.url); // Debug
  console.log('Hostname:', hostname); // Debug
  const partyId = domainToPartyId[hostname];
  if (!partyId) {
    console.log('Domain not found in mapping:', hostname); // Debug
    return new Response("Domain not configured", { status: 404 });
  }
  const targetBase = "https://refactor.d2s3bo1qpvtzn8.amplifyapp.com";
  const targetUrl = new URL(url.pathname, targetBase);
  targetUrl.searchParams.set("partyId", partyId);
  console.log('Target URL:', targetUrl.toString()); // Debug
  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body
    });
    console.log('Fetch response status:', response.status); // Debug
    return response;
  } catch (error) {
    console.log('Fetch error:', error.message); // Debug
    return new Response('Error fetching target', { status: 500 });
  }
}