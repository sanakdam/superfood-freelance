const puppeteer = require('puppeteer');
const { createObjectCsvWriter } = require('csv-writer');
const fs = require('fs');

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────

const DEFAULT_URL = 'https://food.grab.com/id/id/restaurant/ayam-katsu-katsunami-lokarasa-citraland-delivery/6-C7EYGBJDME3JRN';

const CSV_HEADERS = [
  { id: 'outletName',      title: 'Nama outlet' },
  { id: 'categoryName',    title: 'Nama kategori' },
  { id: 'menuName',        title: 'Nama menu' },
  { id: 'description',     title: 'Deskripsi menu' },
  { id: 'originalPrice',   title: 'Harga sebelum promo' },
  { id: 'discountedPrice', title: 'Harga setelah promo' },
  { id: 'discountInfo',    title: 'Nominal atau persentase promo' },
  { id: 'availability',    title: 'Ketersediaan menu' },
];

// ─────────────────────────────────────────────
// BROWSER
// ─────────────────────────────────────────────

async function openBrowser() {
  return puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
}

async function openPage(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  return page;
}

// ─────────────────────────────────────────────
// NETWORK INTERCEPTION
// ─────────────────────────────────────────────

// GrabFood loads menu data via this internal API.
// We intercept the response instead of scraping the DOM.
function interceptMerchantAPI(page) {
  return new Promise((resolve) => {
    page.on('response', async (response) => {
      const url = response.url();
      const isMerchantAPI = url.includes('portal.grab.com/foodweb') && url.includes('merchants/');

      if (isMerchantAPI) {
        try {
          const json = await response.json();
          if (json.merchant) {
            console.log(`Captured API: ${url}`);
            resolve(json);
          }
        } catch (_) {}
      }
    });
  });
}

// ─────────────────────────────────────────────
// PARSING
// ─────────────────────────────────────────────

// GrabFood stores prices in minor units (e.g. 5400000 = Rp 54.000)
function formatRupiah(priceInMinorUnit) {
  if (!priceInMinorUnit) return '';
  const amount = priceInMinorUnit / 100;
  return `Rp ${Number(amount).toLocaleString('id-ID')}`;
}

function getDiscountInfo(originalPriceRaw, discountedPriceRaw, discountPercent) {
  if (discountedPriceRaw && originalPriceRaw && discountedPriceRaw < originalPriceRaw) {
    const pct = Math.round((1 - discountedPriceRaw / originalPriceRaw) * 100);
    return `${pct}%`;
  }
  if (discountPercent) return `${discountPercent}%`;
  return '';
}

function parseMenuItem(item, outletName, categoryName) {
  const originalPriceRaw   = item.priceInMinorUnit ?? item.price ?? 0;
  const discountedPriceRaw = item.discountedPriceInMinorUnit ?? null;

  return {
    outletName,
    categoryName,
    menuName:        item.name        || '',
    description:     item.description || '',
    originalPrice:   formatRupiah(originalPriceRaw),
    discountedPrice: formatRupiah(discountedPriceRaw),
    discountInfo:    getDiscountInfo(originalPriceRaw, discountedPriceRaw, item.discountPercent),
    availability:    item.available === false || item.inStock === false ? 'Tidak tersedia' : 'Tersedia',
  };
}

function parseMerchantData(apiResponse) {
  const merchant    = apiResponse.merchant;
  const outletName  = merchant.name || 'Unknown';
  const categories  = merchant.menu?.categories || merchant.categories || [];

  const items = categories.flatMap(cat =>
    (cat.items || []).map(item => parseMenuItem(item, outletName, cat.name || 'Uncategorized'))
  );

  console.log(`Outlet  : ${outletName}`);
  console.log(`Kategori: ${categories.length}  |  Menu: ${items.length}\n`);

  return { outletName, totalCategories: categories.length, items };
}

// ─────────────────────────────────────────────
// SCRAPER
// ─────────────────────────────────────────────

async function scrapeGrabFood(url) {
  console.log(`Scraping: ${url}\n`);

  const browser = await openBrowser();
  const page    = await openPage(browser);

  try {
    // Start intercepting before navigating so we don't miss the response
    const apiDataPromise = interceptMerchantAPI(page);

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Wait max 10s for the API response to be captured
    const apiData = await Promise.race([
      apiDataPromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('API response not captured. URL may be invalid or geo-blocked.')), 10000)
      ),
    ]);

    return parseMerchantData(apiData);
  } finally {
    await browser.close();
  }
}

// ─────────────────────────────────────────────
// OUTPUT
// ─────────────────────────────────────────────

async function saveCSV(data, filename = 'menu_data.csv') {
  const writer = createObjectCsvWriter({ path: filename, header: CSV_HEADERS });
  await writer.writeRecords(data.items);
  console.log(`Saved CSV  → ${filename}`);
}

function saveJSON(data, filename = 'menu_data.json') {
  fs.writeFileSync(filename, JSON.stringify(data, null, 2));
  console.log(`Saved JSON → ${filename}`);
}

function printSummary(data) {
  console.log('='.repeat(65));
  console.log(`Outlet    : ${data.outletName}`);
  console.log(`Kategori  : ${data.totalCategories}  |  Total menu: ${data.items.length}`);
  console.log('='.repeat(65));

  let lastCategory = '';
  data.items.forEach(item => {
    if (item.categoryName !== lastCategory) {
      lastCategory = item.categoryName;
      console.log(`\n▶ ${item.categoryName}`);
    }

    const price = item.discountedPrice
      ? `${item.originalPrice} → ${item.discountedPrice} (${item.discountInfo})`
      : item.originalPrice || 'N/A';

    console.log(`  • ${item.menuName}`);
    console.log(`    Harga : ${price}`);
    console.log(`    Status: ${item.availability}`);
    if (item.description) {
      console.log(`    Desc  : ${item.description.substring(0, 90)}`);
    }
  });

  console.log('');
}

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────

async function main() {
  const url = process.argv[2] || process.env.GRAB_URL || DEFAULT_URL;

  try {
    const data = await scrapeGrabFood(url);
    printSummary(data);
    await saveCSV(data);
    saveJSON(data);
    console.log('Done!');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
