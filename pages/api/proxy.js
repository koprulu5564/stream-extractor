export default {
  async fetch(request) {
    // 1. İstek Kontrolleri
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS'
        }
      });
    }

    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Sadece GET istekleri kabul edilir' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. URL Parametre Kontrolü
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');
    
    if (!targetUrl) {
      return new Response(JSON.stringify({ error: 'URL parametresi eksik' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 3. URL Doğrulama
    let parsedUrl;
    try {
      parsedUrl = new URL(targetUrl);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Geçersiz protokol');
      }
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Geçersiz URL formatı' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      // 4. Hedef Sayfayı Çekme
      const pageResponse = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        },
        cf: {
          cacheTtl: 600,
          cacheEverything: true
        }
      });

      if (!pageResponse.ok) {
        throw new Error(`Sayfa yüklenemedi (HTTP ${pageResponse.status})`);
      }

      const html = await pageResponse.text();

      // 5. Gelişmiş Medya URL Yakalama
      const mediaPatterns = [
        // Standart video/audio dosyaları
        /(?:src|href|data-src|source)\s*=\s*["'](.*?\.(?:m3u8|mp4|mkv|webm|mp3|aac|ogg|ts|m4s|mpd|ism)(?:\?[^"']*)?)["']/gi,
        
        // Streaming manifestleri
        /(?:url|file|video_url|audio_url)\s*[:=]\s*["'](.*?\/manifest\.mpd|.*?\/playlist\.m3u8[^"']*)["']/gi,
        
        // Özel stream formatları
        /https?:\/\/(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?::\d+)?(?:\/[^\/\s]+)*\/stream[^"\'\s]*/gi,
        
        // Dynamic URL'ler
        /(?:https?:\/\/[^\s"']+\.(?:m3u8|mp4|mpd)[^\s"']*)/gi
      ];

      // 6. Tüm Potansiyel URL'leri Topla
      const mediaUrls = new Set();
      for (const pattern of mediaPatterns) {
        let match;
        while ((match = pattern.exec(html)) !== null) {
          let url = match[1] || match[0];
          try {
            if (!url.startsWith('http')) {
              url = new URL(url, parsedUrl.origin).toString();
            }
            mediaUrls.add(url.split(/["'\s>]/)[0]);
          } catch (e) { continue; }
        }
      }

      // 7. URL'leri Doğrulama ve En Uygununu Seçme
      const validUrls = [];
      for (const url of mediaUrls) {
        try {
          // Hızlı kontrol için HEAD isteği
          const headRes = await fetch(url, { 
            method: 'HEAD',
            redirect: 'follow',
            headers: { 'User-Agent': 'StreamValidator/1.0' }
          });
          
          if (headRes.ok) {
            const contentType = headRes.headers.get('content-type') || '';
            if (/^(video|audio|application\/(x-mpegURL|vnd\.apple\.mpegurl|dash\+xml))/.test(contentType)) {
              validUrls.push({
                url,
                type: contentType,
                priority: url.includes('.m3u8') ? 1 : (url.includes('.mp4') ? 2 : 3)
              });
              continue;
            }
          }
          
          // Daha detaylı kontrol için kısmi GET isteği
          const getRes = await fetch(url, {
            headers: { 'Range': 'bytes=0-1024' },
            redirect: 'follow'
          });
          
          if (getRes.ok) {
            const buffer = await getRes.arrayBuffer();
            const arr = new Uint8Array(buffer);
            
            // Magic number kontrolü
            const signatures = {
              m3u8: [0x23, 0x45, 0x58, 0x54], // #EXT
              mp4: [0x66, 0x74, 0x79, 0x70],   // ftyp
              webm: [0x1A, 0x45, 0xDF, 0xA3]   // EBML
            };
            
            for (const [format, sig] of Object.entries(signatures)) {
              if (sig.every((byte, i) => byte === arr[i])) {
                validUrls.push({
                  url,
                  type: `detected/${format}`,
                  priority: format === 'm3u8' ? 1 : (format === 'mp4' ? 2 : 3)
                });
                break;
              }
            }
          }
        } catch (e) { continue; }
      }

      // 8. En İyi Akış URL'sini Seç ve Yönlendir
      if (validUrls.length > 0) {
        // Öncelik sırasına göre sırala (m3u8 > mp4 > diğerleri)
        validUrls.sort((a, b) => a.priority - b.priority);
        const bestStreamUrl = validUrls[0].url;
        
        // Doğrudan yönlendirme yap
        return Response.redirect(bestStreamUrl, 302);
      }

      // 9. Akış Bulunamazsa
      return new Response(JSON.stringify({
        error: 'Akış URLsi bulunamadı',
        details: {
          scanned_urls: Array.from(mediaUrls),
          tested_urls: validUrls,
          source_page: targetUrl
        }
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      // 10. Hata Yönetimi
      return new Response(JSON.stringify({
        error: 'İşlem sırasında hata oluştu',
        details: error.message,
        stack: error.stack
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};
