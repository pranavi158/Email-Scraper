const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// SSE Client Store
const clients = new Map();

app.get('/api/scrape/progress', (req, res) => {
    const { clientId } = req.query;
    if (!clientId) {
        return res.status(400).send('Requires clientId');
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    clients.set(clientId, res);

    req.on('close', () => {
        clients.delete(clientId);
    });
});

const sendProgress = (clientId, data) => {
    const client = clients.get(clientId);
    if (client) {
        client.write(`data: ${JSON.stringify(data)}\n\n`);
    }
};

async function scrapePage(targetUrl, baseDomain) {
    try {
        const response = await axios.get(targetUrl, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html'
            }
        });
        
        if (!response.headers['content-type']?.includes('text/html')) {
            return { emails: [], links: [] };
        }

        const html = response.data;
        const $ = cheerio.load(html);
        
        // We previously removed scripts here, but keeping them allows us to find emails in JSON or SEO data.
        
        const internalLinks = new Set();
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            if (href) {
                try {
                    const resolved = new URL(href, targetUrl).href;
                    if (new URL(resolved).hostname.endsWith(baseDomain)) {
                        const withoutHash = resolved.split('#')[0];
                        internalLinks.add(withoutHash);
                    }
                } catch (e) {
                    // Ignore parsing errors for individual URLs
                }
            }
        });

        // Search text and hrefs
        const textContent = $('body').text() + ' ' + Array.from(internalLinks).join(' ');
        const matches = textContent.match(emailRegex) || [];
        
        return {
            emails: matches,
            links: Array.from(internalLinks)
        };
    } catch (e) {
        return { emails: [], links: [] };
    }
}

app.post('/api/scrape', async (req, res) => {
    const { url, clientId, maxPages = 20 } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    let startUrl;
    try {
        startUrl = new URL(url.startsWith('http') ? url : `https://${url}`);
    } catch (e) {
        return res.status(400).json({ error: 'Invalid URL format' });
    }
    
    const baseDomain = startUrl.hostname.replace(/^www\./, '');
    const visited = new Set();
    const queue = [startUrl.href];
    const allEmails = new Set();
    let pagesScanned = 0;

    if (clientId) {
        sendProgress(clientId, { status: 'started', message: `Initializing scraping for ${baseDomain}...` });
    }

    while (queue.length > 0 && pagesScanned < maxPages) {
        const currentUrl = queue.shift();
        
        if (visited.has(currentUrl)) continue;
        visited.add(currentUrl);
        pagesScanned++;

        if (clientId) {
            sendProgress(clientId, { 
                status: 'scraping', 
                currentUrl, 
                pagesScanned, 
                maxPages 
            });
        }

        const { emails, links } = await scrapePage(currentUrl, baseDomain);
        
        emails.forEach(email => {
            const lower = email.toLowerCase();
            if (!lower.endsWith('.png') && !lower.endsWith('.jpg') && !lower.endsWith('.jpeg') && !lower.endsWith('.gif') && !lower.endsWith('.webp')) {
                allEmails.add(lower);
            }
        });

        links.forEach(link => {
            if (!visited.has(link) && !queue.includes(link)) {
                queue.push(link);
            }
        });
    }

    if (clientId) {
        sendProgress(clientId, { status: 'finished', totalEmails: allEmails.size });
    }

    res.json({
        success: true,
        scannedPages: pagesScanned,
        scannedUrls: Array.from(visited),
        emails: Array.from(allEmails)
    });
});

app.listen(PORT, () => {
    console.log(`Express server running on http://localhost:${PORT}`);
});
