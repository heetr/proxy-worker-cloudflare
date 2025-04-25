// Ánh xạ tên miền -> partyId
const domainToPartyId = {
    'servtech.site': '7f226ba9-de63-4f6d-9e38-332267c8cdf8',
    // Thêm các shop khác ở đây
  };

  addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request));
  });

  async function handleRequest(request) {
    // Lấy hostname từ request
    const url = new URL(request.url);
    const hostname = url.hostname;

    // Lấy partyId tương ứng
    const partyId = domainToPartyId[hostname];

    // Nếu không tìm thấy partyId, trả về lỗi
    if (!partyId) {
      return new Response('Domain not configured', { status: 404 });
    }

    // Tạo URL đích
    const targetBase = 'https://refactor.d2s3bo1qpvtzn8.amplifyapp.com';
    const targetUrl = new URL(url.pathname, targetBase);

    // Thêm partyId vào query parameter
    targetUrl.searchParams.set('partyId', partyId);

    // Proxy yêu cầu đến URL đích
    return fetch(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body
    });
  }