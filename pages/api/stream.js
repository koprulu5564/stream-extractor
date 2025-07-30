import puppeteer from 'puppeteer-core';
import chromium from 'chrome-aws-lambda';

export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).send('Kullanım: /api/extract?url=https://ornek.com/video');
  }

  let browser = null;

  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath || '/usr/bin/chromium-browser',
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();

    // User-Agent ayarı
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // URL'ye git
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Sayfa içeriğini al
    const html = await page.content();

    // Medya URL'lerini ara
    const mediaUrls = extractMediaUrls(html, url);

    if (mediaUrls.length === 0) {
      return res.status(404).send('Medya URL bulunamadı.');
    }

    // İlk çalışan linki test et (isteğe bağlı)
    for (let mediaUrl of mediaUrls) {
      try {
        const response = await fetch(mediaUrl, { method: 'HEAD' });
        if (response.ok) {
          return res.redirect(302, mediaUrl);
        }
      } catch (err) {
        continue;
      }
    }

    return res.status(500).send('Medya bağlantıları bulunamadı ya da erişilemiyor.');

  } catch (err) {
    return res.status(500).send(`Hata: ${err.message}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

function extractMediaUrls(html, baseUrl) {
  const patterns = [
    /(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/gi,
    /(https?:\/\/[^\s"']+\.mp4[^\s"']*)/gi,
    /(https?:\/\/[^\s"']+\.mpd[^\s"']*)/gi,
    /(https?:\/\/[^\s"']+\.ts[^\s"']*)/gi,
    /source:\s*["']([^"']+)["']/gi,
    /<source[^>]*src=["']([^"']+)["']/gi,
    /player\.load\(["']([^"']+)["']/gi
  ];

  const base = new URL(baseUrl);
  const urls = new Set();

  for (const pattern of patterns) {
    const matches = html.matchAll(pattern);
    for (const match of matches) {
      let rawUrl = match[1] || match[0];
      rawUrl = rawUrl.replace(/&amp;/g, '&').replace(/^["']|["']$/g, '');
      try {
        const finalUrl = new URL(rawUrl, base).toString();
        if (isValidMediaUrl(finalUrl)) {
          urls.add(finalUrl);
        }
      } catch (e) {
        continue;
      }
    }
  }

  return [...urls];
}

function isValidMediaUrl(url) {
  return /\.(m3u8|mp4|mpd|m4s|ts)(\?|$)/i.test(url);
}
