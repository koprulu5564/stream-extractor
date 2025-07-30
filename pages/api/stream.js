import chromium from "@sparticuz/chromium-min";
import puppeteer from "puppeteer-core";

export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: "URL parametresi gerekli." });
  }

  try {
    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });

    const requests = [];

    page.on("request", (request) => {
      const rUrl = request.url();
      if (/\.(m3u8|mp4|webm|mpd)(\?|$)/i.test(rUrl)) {
        requests.push(rUrl);
      }
    });

    await page.waitForTimeout(8000); // 8 saniye bekle

    await browser.close();

    if (requests.length === 0) {
      return res.status(404).json({ error: "Medya bağlantısı bulunamadı." });
    }

    return res.redirect(requests[0]);
  } catch (error) {
    console.error("HATA:", error);
    return res.status(500).json({ error: "İşlem sırasında hata oluştu." });
  }
}
