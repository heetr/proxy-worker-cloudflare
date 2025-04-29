const MAX_REDIRECTS = 5; // Số lần redirect tối đa
const CACHE_SIZE_LIMIT = 1000; // Giới hạn kích thước cache
const DEBUG = typeof DEBUG_LOG === 'string' && DEBUG_LOG.toLowerCase() === 'true'; // Bật/tắt chế độ debug
const VALIDATE = typeof VALIDATE_PARTY_ID === 'string' && VALIDATE_PARTY_ID.toLowerCase() === 'true'; // Bật/tắt kiểm tra UUID
const TARGET_BASE = TARGET_BASE || 'https://generic-shop.bookingcampus.com'; // URL đích mặc định

// Bộ nhớ cache cho ánh xạ hostname -> partyId
const partyIdCache = new Map();

/**
 * Kiểm tra tính hợp lệ của UUID (phiên bản 1-5)
 * @param {string} uuid - Chuỗi UUID cần kiểm tra
 * @returns {boolean} - True nếu UUID hợp lệ
 */
function isValidUUID(uuid) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Lấy partyId từ cache hoặc KV dựa trên hostname
 * @param {string} hostname - Hostname của yêu cầu
 * @returns {Promise<string|null>} - PartyId hoặc null nếu không tìm thấy
 */
async function getPartyId(hostname) {
  // Kiểm tra cache trước
  const cached = partyIdCache.get(hostname);
  if (cached) {
    if (DEBUG) console.log(`Cache hit for hostname: ${hostname}, partyId: ${cached}`);
    return cached;
  }

  try {
    // Truy vấn KV để lấy partyId
    const partyId = await DOMAIN_PARTY_ID_MAPPING.get(hostname);
    if (partyId) {
      // Giới hạn kích thước cache để tránh tràn bộ nhớ
      if (partyIdCache.size >= CACHE_SIZE_LIMIT) {
        if (DEBUG) console.log('Cache size limit reached, clearing cache');
        partyIdCache.clear();
      }
      partyIdCache.set(hostname, partyId);
      if (DEBUG) console.log(`Cached partyId for hostname: ${hostname}, partyId: ${partyId}`);
    } else {
      if (DEBUG) console.warn(`No partyId found for hostname: ${hostname}`);
    }
    return partyId;
  } catch (error) {
    console.error(`KV lookup error for hostname ${hostname}:`, error);
    return null;
  }
}

/**
 * Chuẩn hóa pathname (loại bỏ trailing slash nếu không phải root)
 * @param {string} pathname - Đường dẫn cần chuẩn hóa
 * @returns {string} - Đường dẫn đã chuẩn hóa
 */
function normalizePathname(pathname) {
  return pathname.endsWith('/') && pathname !== '/' ? pathname.slice(0, -1) : pathname;
}

/**
 * Xử lý yêu cầu HTTP chính
 * @param {Request} request - Yêu cầu HTTP từ client
 * @returns {Promise<Response>} - Phản hồi HTTP
 */
async function handleRequest(request) {
  const url = new URL(request.url);
  const hostname = url.hostname;

  // Lấy partyId từ header hoặc KV
  let clientPartyId = request.headers.get('x-party-id');
  let partyIdSource = clientPartyId ? 'header' : 'none';
  let kvPartyId = await getPartyId(hostname);

  // Kiểm tra nếu không tìm thấy partyId trong KV
  if (!kvPartyId) {
    if (DEBUG) console.error(`Domain not configured for hostname: ${hostname}`);
    return new Response('Domain not configured', { status: 404 });
  }

  // Nếu client cung cấp partyId, kiểm tra tính hợp lệ và khớp với KV
  if (clientPartyId) {
    if (VALIDATE && !isValidUUID(clientPartyId)) {
      if (DEBUG) console.error(`Invalid x-party-id format: ${clientPartyId}`);
      return new Response('Invalid x-party-id', { status: 400 });
    }
    if (clientPartyId !== kvPartyId) {
      if (DEBUG) console.error(`x-party-id does not match KV: ${clientPartyId} !== ${kvPartyId}`);
      return new Response('Unauthorized x-party-id', { status: 403 });
    }
  } else {
    clientPartyId = kvPartyId; // Sử dụng partyId từ KV nếu header không có
  }

  // Chuẩn bị URL đích
  const targetUrl = new URL(normalizePathname(url.pathname), TARGET_BASE);
  targetUrl.search = url.search; // Bảo toàn query parameters

  // Ghi log debug
  if (DEBUG) {
    console.log(`Request URL: ${request.url}`);
    console.log(`Target URL: ${targetUrl.toString()}`);
    console.log(`Party-Id: ${clientPartyId} (Source: ${partyIdSource})`);
  }

  // Sao chép và cập nhật headers
  const headers = new Headers(request.headers);
  headers.set('x-party-id', clientPartyId);
  headers.set('User-Agent', 'Cloudflare-Worker');

  // Chuẩn bị yêu cầu chuyển tiếp
  const reqInit = {
    method: request.method,
    headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
    redirect: 'manual',
  };

  // Xử lý redirect
  let currentUrl = targetUrl.toString();
  let redirectCount = 0;
  let response;

  while (redirectCount < MAX_REDIRECTS) {
    try {
      response = await fetch(currentUrl, reqInit);
      if (DEBUG) console.log(`Response status: ${response.status}`);

      // Kiểm tra nếu không phải redirect
      if (response.status < 300 || response.status >= 400) break;

      // Lấy URL redirect từ header Location
      const location = response.headers.get('Location');
      if (!location) break;

      // Chuẩn hóa URL redirect
      const newUrl = new URL(location, currentUrl);
      newUrl.pathname = normalizePathname(newUrl.pathname);
      currentUrl = newUrl.toString();
      redirectCount++;

      if (DEBUG) console.log(`Redirect ${redirectCount} to: ${currentUrl}`);
    } catch (error) {
      console.error(`Fetch error at ${currentUrl}:`, error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }

  // Kiểm tra nếu vượt quá số lần redirect
  if (redirectCount >= MAX_REDIRECTS) {
    if (DEBUG) console.error('Too many redirects');
    return new Response('Too many redirects', { status: 508 });
  }

  // Chuẩn bị phản hồi
  const respHeaders = new Headers(response.headers);
  respHeaders.set('Access-Control-Allow-Origin', '*'); // Hỗ trợ CORS

  return new Response(response.body, {
    status: response.status,
    headers: respHeaders,
  });
}

// Sự kiện fetch chính của Cloudflare Worker

addEventListener('fetch', (event) => {
  event.respondWith(
    handleRequest(event.request).catch((error) => {
      console.error('Worker error:', error);
      return new Response('Internal Server Error', { status: 500 });
    })
  );
});