// Telegram Bot API base URL
const TELEGRAM_API_BASE = 'https://api.telegram.org';

// HTML template for documentation
const DOC_HTML = `<!DOCTYPE html>
<html>
<head>
    <title>Telegram Bot API Proxy Documentation</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            color: #333;
        }
        h1 { color: #0088cc; }
        .code {
            background: #f5f5f5;
            padding: 15px;
            border-radius: 5px;
            font-family: monospace;
            overflow-x: auto;
        }
        .note {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
        }
        .example {
            background: #e7f5ff;
            border-left: 4px solid #0088cc;
            padding: 15px;
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <h1>Telegram Bot API Proxy</h1>
    <p>This service acts as a transparent proxy for the Telegram Bot API. It allows you to bypass network restrictions and create middleware for your Telegram bot applications.</p>
    
    <h2>How to Use</h2>
    <p>Replace <code>api.telegram.org</code> with this worker's URL in your API calls.</p>
    
    <div class="example">
        <h3>Example Usage:</h3>
        <p>Original Telegram API URL:</p>
        <div class="code">https://api.telegram.org/bot{YOUR_BOT_TOKEN}/sendMessage</div>
        <p>Using this proxy:</p>
        <div class="code">https://{YOUR_WORKER_URL}/bot{YOUR_BOT_TOKEN}/sendMessage</div>
    </div>

    <h2>Features</h2>
    <ul>
        <li>Supports all Telegram Bot API methods</li>
        <li>Handles both GET and POST requests</li>
        <li>Full CORS support for browser-based applications</li>
        <li>Transparent proxying of responses</li>
        <li>Maintains original status codes and headers</li>
        <li><strong>NEW:</strong> Send images from URL to groups with <code>/bot{TOKEN}/sendPhotoFromUrl</code></li>
    </ul>

    <div class="note">
        <strong>Note:</strong> This proxy does not store or modify your bot tokens. All requests are forwarded directly to Telegram's API servers.
    </div>

    <h2>Send Photo From URL</h2>
    <p>Use the special endpoint to send images from URL to groups or chats:</p>
    
    <div class="example">
        <h3>Endpoint:</h3>
        <div class="code">POST https://{YOUR_WORKER_URL}/bot{YOUR_BOT_TOKEN}/sendPhotoFromUrl</div>
        
        <h3>Request Body (JSON):</h3>
        <div class="code">{
  "url": "https://example.com/image.jpg",
  "chat_id": "123456789",
  "caption": "Optional caption for the image",
  "parse_mode": "HTML"
}</div>
        
        <h3>Required Parameters:</h3>
        <ul>
            <li><code>url</code> - Direct URL to the image file</li>
            <li><code>chat_id</code> - Group or user chat ID to send the image to</li>
        </ul>
        
        <h3>Optional Parameters:</h3>
        <ul>
            <li><code>caption</code> - Caption text for the image</li>
            <li><code>parse_mode</code> - Parse mode for caption (HTML, Markdown, etc.)</li>
        </ul>
    </div>

    <h2>Example Code</h2>
    <div class="code">
// JavaScript Example - Regular API call
fetch('https://{YOUR_WORKER_URL}/bot{YOUR_BOT_TOKEN}/sendMessage', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        chat_id: "123456789",
        text: "Hello from Telegram Bot API Proxy!"
    })
})
.then(response => response.json())
.then(data => console.log(data));

// JavaScript Example - Send Photo From URL
fetch('https://{YOUR_WORKER_URL}/bot{YOUR_BOT_TOKEN}/sendPhotoFromUrl', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        url: "https://example.com/image.jpg",
        chat_id: "123456789",
        caption: "Image sent from URL!"
    })
})
.then(response => response.json())
.then(data => console.log(data));
    </div>
</body>
</html>`;

async function handleRequest(request) {
  const url = new URL(request.url);

  if (url.pathname === '/' || url.pathname === '') {
    return new Response(DOC_HTML, {
      headers: {
        'Content-Type': 'text/html;charset=UTF-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  // Extract path segments to validate the request format.
  // Accept either /bot{token}/{method} or /file/bot{token}/{file_path}
  const pathParts = url.pathname.split('/').filter(Boolean);
  if (pathParts.length < 2) {
    return new Response('Invalid request format', { status: 400 });
  }
  if (pathParts[0] === 'file') {
    if (pathParts.length < 3 || !pathParts[1].startsWith('bot')) {
      return new Response('Invalid file request format', { status: 400 });
    }
  } else if (!pathParts[0].startsWith('bot')) {
    return new Response('Invalid bot request format', { status: 400 });
  }

  // Handle special endpoint for sending photo from URL
  if (pathParts.length === 2 && pathParts[0].startsWith('bot') && pathParts[1] === 'sendPhotoFromUrl') {
    return await handleSendPhotoFromUrl(request, pathParts[0]);
  }

  // Reconstruct the Telegram API URL
  const telegramUrl = `${TELEGRAM_API_BASE}${url.pathname}${url.search}`;

  // Clone request headers so we can safely modify them
  const headers = new Headers(request.headers);

  // Ensure JSON requests explicitly use UTF-8 to avoid issues with emoji or
  // other special characters
  const contentType = headers.get('Content-Type');
  if (contentType && contentType.startsWith('application/json') && !contentType.includes('charset')) {
    headers.set('Content-Type', 'application/json; charset=UTF-8');
  }

  const init = {
    method: request.method,
    headers,
    redirect: 'follow',
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
  }

  // Forward the request to Telegram API, streaming the body when present.
  const proxyReq = new Request(telegramUrl, init);

  try {
    const tgRes = await fetch(proxyReq);
    const res = new Response(tgRes.body, tgRes); // Copy response as-is
    const reqAllowHeaders = request.headers.get('Access-Control-Request-Headers');
    const allowHeaders = reqAllowHeaders ? reqAllowHeaders : 'Content-Type';
    res.headers.set('Access-Control-Allow-Origin', '*');
    res.headers.set(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE, OPTIONS, HEAD'
    );
    res.headers.set('Access-Control-Allow-Headers', allowHeaders);
    return res;
  } catch (err) {
    return new Response(`Error proxying request: ${err.message}`, { status: 500 });
  }
}

// Handle sending photo from URL to group
async function handleSendPhotoFromUrl(request, botToken) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed. Use POST.', { status: 405 });
  }

  try {
    // Parse request body
    let requestData;
    const contentType = request.headers.get('Content-Type');
    
    if (contentType && contentType.includes('application/json')) {
      requestData = await request.json();
    } else {
      return new Response('Content-Type must be application/json', { status: 400 });
    }

    // Validate required parameters
    const { url: imageUrl, chat_id, caption, parse_mode } = requestData;
    
    if (!imageUrl) {
      return new Response('Missing required parameter: url', { status: 400 });
    }
    
    if (!chat_id) {
      return new Response('Missing required parameter: chat_id', { status: 400 });
    }

    // Validate URL format
    try {
      new URL(imageUrl);
    } catch (error) {
      return new Response('Invalid URL format', { status: 400 });
    }

    // Check if URL appears to be an image
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    const urlLower = imageUrl.toLowerCase();
    const hasImageExtension = imageExtensions.some(ext => urlLower.includes(ext));
    
    if (!hasImageExtension && !urlLower.includes('image') && !urlLower.includes('photo')) {
      console.warn('URL may not be an image:', imageUrl);
    }

    // Prepare the request to Telegram API
    const telegramUrl = `${TELEGRAM_API_BASE}/${botToken}/sendPhoto`;
    
    const telegramPayload = {
      chat_id: chat_id,
      photo: imageUrl,
    };

    // Add optional parameters if provided
    if (caption) {
      telegramPayload.caption = caption;
    }
    
    if (parse_mode) {
      telegramPayload.parse_mode = parse_mode;
    }

    // Send request to Telegram API
    const telegramResponse = await fetch(telegramUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify(telegramPayload),
    });

    // Get response from Telegram
    const responseData = await telegramResponse.text();
    
    // Create response with CORS headers
    const response = new Response(responseData, {
      status: telegramResponse.status,
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });

    return response;

  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error_code: 500,
        description: `Error processing request: ${error.message}`,
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    );
  }
}

// Handle OPTIONS requests for CORS
function handleOptions(request) {
  const reqAllowHeaders = request.headers.get('Access-Control-Request-Headers');
  const allowHeaders = reqAllowHeaders ? reqAllowHeaders : 'Content-Type';

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
    'Access-Control-Allow-Headers': allowHeaders,
    'Access-Control-Max-Age': '86400',
  };

  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

// Main event listener for the worker
addEventListener('fetch', event => {
  const request = event.request;
  
  // Handle CORS preflight requests
  if (request.method === 'OPTIONS') {
    event.respondWith(handleOptions(request));
  } else {
    event.respondWith(handleRequest(request));
  }
}); 