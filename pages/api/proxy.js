export default async function handler(req, res) {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    const fetchResponse = await fetch(targetUrl, {
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
        'Referer': targetUrl,
      },
    });

    const contentType = fetchResponse.headers.get('content-type');
    res.setHeader('Content-Type', contentType || 'application/octet-stream');

    const body = await fetchResponse.arrayBuffer();
    res.status(fetchResponse.status).send(Buffer.from(body));
  } catch (err) {
    res.status(500).json({ error: 'Proxy failed', details: err.message });
  }
}
