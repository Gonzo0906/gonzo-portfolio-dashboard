"""Fetch public market snapshots server-side; never invent missing values."""
import concurrent.futures as cf
import datetime as dt
import email.utils
import json
import os
from pathlib import Path
import re
import urllib.parse as up
import urllib.request as ur
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'
UTC = dt.timezone.utc

def request(url):
    headers = {'User-Agent': 'Mozilla/5.0 (GonzoPortfolioDashboard)', 'Accept': 'application/json, application/xml, text/xml, */*'}
    if 'api.coingecko.com' in url and os.getenv('COINGECKO_DEMO_API_KEY'):
        headers['x-cg-demo-api-key'] = os.environ['COINGECKO_DEMO_API_KEY']
    with ur.urlopen(ur.Request(url, headers=headers), timeout=30) as r:
        return r.read()

def stock(symbol):
    try:
        url = f'https://query1.finance.yahoo.com/v8/finance/chart/{up.quote(symbol)}?interval=1d&range=5d'
        chart = json.loads(request(url))['chart']['result'][0]
        m = chart['meta']
        if m['symbol'].upper() != symbol.upper() or m['currency'] != 'USD':
            raise ValueError('Provider symbol/currency mismatch')
        price = m.get('regularMarketPrice')
        if not isinstance(price, (int, float)) or price <= 0 or not m.get('regularMarketTime'):
            raise ValueError('No valid price/timestamp')
        # chartPreviousClose is the beginning of a multi-day range, NOT yesterday.
        previous = m.get('previousClose')
        if previous is None:
            times = chart.get('timestamp', [])
            closes = chart['indicators']['quote'][0]['close']
            market_date = dt.datetime.fromtimestamp(m['regularMarketTime'], UTC).date()
            prior = [c for t, c in zip(times, closes) if c is not None and dt.datetime.fromtimestamp(t, UTC).date() < market_date]
            previous = prior[-1] if prior else None
        daily = (price / previous - 1) * 100 if previous and previous > 0 else None
        return symbol, {'price': price, 'dailyPct': daily, 'timestamp': m['regularMarketTime'], 'provider': 'Yahoo Finance public chart', 'providerId': m['symbol'], 'name': m.get('longName') or m.get('shortName') or symbol, 'status': 'delayed', 'sessionEnd': m.get('currentTradingPeriod', {}).get('regular', {}).get('end'), 'previousClose': previous}
    except Exception as e:
        return symbol, {'price': None, 'dailyPct': None, 'timestamp': None, 'provider': 'Yahoo Finance public chart', 'providerId': symbol, 'status': 'unavailable', 'error': f'{type(e).__name__}: {e}'}

def crypto(rows):
    ids = [r[2] for r in rows]
    # Verify exact IDs AND symbols against the provider catalog on each run.
    catalog = {c['id']: c for c in json.loads(request('https://api.coingecko.com/api/v3/coins/list'))}
    valid = [r for r in rows if r[2] in catalog and catalog[r[2]]['symbol'].casefold() == r[0].casefold()]
    url = 'https://api.coingecko.com/api/v3/simple/price?' + up.urlencode({'ids': ','.join(r[2] for r in valid), 'vs_currencies': 'usd', 'include_24hr_change': 'true', 'include_last_updated_at': 'true'})
    data = json.loads(request(url))
    output = {}
    for symbol, _, ident, _ in rows:
        value = data.get(ident, {})
        ok = any(r[0] == symbol for r in valid) and isinstance(value.get('usd'), (int, float)) and value['usd'] > 0 and value.get('last_updated_at')
        output[symbol] = {'price': value.get('usd') if ok else None, 'dailyPct': value.get('usd_24h_change') if ok else None, 'timestamp': value.get('last_updated_at') if ok else None, 'provider': 'CoinGecko', 'providerId': ident, 'name': catalog.get(ident, {}).get('name'), 'status': 'connected' if ok else 'unavailable'}
    return output

def news_query(query, tags):
    url = 'https://news.google.com/rss/search?' + up.urlencode({'q': query + ' when:7d', 'hl': 'en-US', 'gl': 'US', 'ceid': 'US:en'})
    items = []
    for n in ET.fromstring(request(url)).findall('./channel/item')[:8]:
        title = n.findtext('title', '')
        source = n.findtext('source', '')
        link = n.findtext('link', '')
        published = n.findtext('pubDate', '')
        try:
            stamp = email.utils.parsedate_to_datetime(published).timestamp()
        except Exception:
            continue
        if not link.startswith('https://'):
            continue
        items.append({'id': link, 'title': title, 'source': source or 'Publisher via Google News', 'published': stamp, 'url': link, 'tags': tags, 'summary': 'Headline summary: ' + (title.rsplit(' - ' + source, 1)[0] if source else title), 'summaryType': 'Headline-derived; full article not retrieved', 'linkType': 'Google News link to original publisher'})
    return items

def main():
    holdings = json.loads((PUBLIC / 'holdings.json').read_text())
    now = dt.datetime.now(UTC).timestamp()
    quotes = dict(cf.ThreadPoolExecutor(max_workers=4).map(stock, [s[0] for s in holdings['stocks']]))
    issues = []
    try:
        quotes.update(crypto(holdings['crypto']))
    except Exception as e:
        issues.append('CoinGecko: ' + str(e))
        for s, _, ident, _ in holdings['crypto']:
            quotes[s] = {'price': None, 'timestamp': None, 'dailyPct': None, 'provider': 'CoinGecko', 'providerId': ident, 'status': 'unavailable'}
    queries = [
        ('(Nvidia OR Amazon OR Tesla OR Palantir OR SpaceX OR ServiceNow) stock', ['NVDA','AMZN','TSLA','PLTR','SPCX','NOW']),
        ('(Vanguard S&P 500 OR Eaton OR Intuitive Surgical OR Constellation Energy OR Marvell OR Qualcomm) stock', ['VOO','ETN','ISRG','CEG','MRVL','QCOM']),
        ('(Robinhood OR Netflix OR Global X Robotics OR SoFi OR D-Wave OR Rigetti OR REX Osprey XRP) stock', ['HOOD','NFLX','BOTZ','SOFI','QBTS','RGTI','XRPR']),
        ('(Red Cat OR Quantum Computing Inc OR Lucid OR AMC OR Phunware) stock', ['RCAT','QUBT','LCID','AMC','PHUN']),
        ('(JitoSOL OR Solana OR Bitcoin OR Dogecoin OR XRP OR Shiba Inu OR Cardano) cryptocurrency', ['JitoSOL','SOL','BTC','DOGE','XRP','SHIB','ADA']),
        ('(Hedera OR Flare network OR Zebec OR World Liberty Financial OR Official Trump OR Pepe OR Pi Network OR Ethereum) cryptocurrency', ['HBAR','FLR','ZBCN','WLFI','TRUMP','PEPE','PI','ETH'])
    ]
    news = {}
    with cf.ThreadPoolExecutor(max_workers=3) as pool:
        futures = [pool.submit(news_query, q, tags) for q, tags in queries]
        for f in futures:
            try:
                for article in f.result():
                    news[article['id']] = article
            except Exception as e:
                issues.append('News: ' + str(e))
    out = {'schema': 1, 'fetchedAt': now, 'refreshMinutes': 15, 'quotes': quotes, 'news': sorted(news.values(), key=lambda n: n['published'], reverse=True), 'newsStatus': 'partial' if any(i.startswith('News:') for i in issues) else 'connected', 'issues': issues}
    (PUBLIC / 'data').mkdir(exist_ok=True)
    (PUBLIC / 'data/market.json').write_text(json.dumps(out, indent=2, allow_nan=False))
    report = {'quotesConnected': sum(q['price'] is not None for q in quotes.values()), 'quotesTotal': len(quotes), 'unavailable': [s for s,q in quotes.items() if q['price'] is None], 'articles': len(news), 'issues': issues}
    print(json.dumps(report, indent=2))

if __name__ == '__main__':
    main()
