const puppeteer = require('puppeteer');

// Change to a real GrabFood restaurant URL you want to scrape
const TARGET_URL = process.argv[2] || 'https://food.grab.com/sg/en/';

async function debug(url) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  const apiCalls = [];
  page.on('response', async (response) => {
    const respUrl = response.url();
    const contentType = response.headers()['content-type'] || '';
    if (contentType.includes('application/json') && !respUrl.includes('analytics')) {
      try {
        const json = await response.json();
        apiCalls.push({ url: respUrl, keys: Object.keys(json) });
      } catch (_) {}
    }
  });

  console.log(`Navigating to: ${url}`);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 5000));

  await page.screenshot({ path: 'screenshot.png' });
  console.log('Screenshot → screenshot.png\n');

  console.log('API calls captured:');
  apiCalls.forEach(c => console.log(` ${c.url}\n   keys: ${c.keys.join(', ')}`));

  const pageInfo = await page.evaluate(() => ({
    title: document.title,
    url: window.location.href,
    h1: document.querySelector('h1')?.textContent,
  }));
  console.log('\nPage info:', pageInfo);

  await browser.close();
}

debug(TARGET_URL).catch(console.error);
