export default async function handler(req, res) {
  try {
    const url = req.query.url;
    if (!url) {
      return res.status(400).json({ error: 'Missing URL parameter' });
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
      },
    });

    const text = await response.text();
    const mediaRegex = /(https?:\/\/.+?\.(m3u8|mp4|mpd)(\?.*?)?)(?=["'\s])/gi;
    const matches = [...text.matchAll(mediaRegex)].map((m) => m[1]);

    return res.status(200).json({ media: matches });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch media', details: err.message });
  }
}
