const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/stream", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send("url param missing");

  let browser;
  try {
    browser = await puppeteer.launch({ args: ["--no-sandbox"], headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

    let mediaUrl;
    page.on("request", (r) => {
      const u = r.url();
      if (/\.(m3u8|mp4|mpd|ts)(\?|$)/i.test(u) && !mediaUrl) {
        mediaUrl = u;
      }
    });

    await page.waitForTimeout(8000);
    await browser.close();

    if (!mediaUrl) return res.status(404).send("Media not found");
    return res.redirect(mediaUrl);
  } catch (err) {
    if (browser) await browser.close();
    return res.status(500).send("Error: " + err.message);
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
