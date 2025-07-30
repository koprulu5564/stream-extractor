import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import chromium from "@sparticuz/chromium-min";
import puppeteerCore from "puppeteer-core";

puppeteer.use(StealthPlugin());

async function getBrowser() {
  return await puppeteerCore.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
    defaultViewport: null,
  });
}

export default async function handler(req, res) {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send("Eksik url parametresi");
  }

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 30000 });

    // Dinamik stream linklerini yakalama
    const mediaUrls = await page.evaluate(() => {
      const urls = [];
      const videoTags = Array.from(document.querySelectorAll("video, source"));

      videoTags.forEach((el) => {
        if (el.src) urls.push(el.src);
        if (el.getAttribute("src")) urls.push(el.getAttribute("src"));
      });

      // Ayrıca sayfadaki metin içinde stream linklerini arama (örneğin m3u8)
      const regex = /(https?:\/\/[^\s"'<>]+?\.(m3u8|mp4|mpd|ts)(\?[^"'<> ]*)?)/gi;
      const matches = document.body.innerHTML.match(regex);
      if (matches) urls.push(...matches);

      // Çift amp; gibi encode edilmiş karakterleri temizleme
      return urls
        .map((url) => url.replace(/&amp;/g, "&"))
        .filter((url) => url.length > 10);
    });

    // Geçerli stream URL'sini bul
    let validUrl = null;
    for (const url of mediaUrls) {
      if (/\.(m3u8|mp4|mpd|ts)(\?|$)/i.test(url)) {
        validUrl = url;
        break;
      }
    }

    if (!validUrl) {
      await browser.close();
      return res.status(404).send("Medya URL bulunamadı");
    }

    await browser.close();

    // İsteğe göre direkt yönlendirme yapabiliriz
    return res.redirect(validUrl);
  } catch (error) {
    await browser.close();
    return res.status(500).send("Hata: " + error.message);
  }
}
