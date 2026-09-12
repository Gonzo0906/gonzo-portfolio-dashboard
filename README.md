# Gonzo Portfolio Dashboard

A dark, viewport-sized stock and crypto dashboard for GitHub Pages. Includes all 24 stock symbols and 15 crypto rows from the provided screenshot transcription, with device-local edits, paginated holdings/news/alerts, dialogs, backups, and configurable popup alerts.

## Data and valuation

Screenshot quantities and average costs are preserved without adjustments. SPCX and XRPR are requested using exactly those symbols. AMC and PHUN cost basis is unknown; XRPR has zero cost, so its percentage investment return is undefined. Crypto cost basis is unknown. PI total quantity is 1037.65; available quantity 1036.66 is stored separately. ETH has a historical screenshot value of $0.07 but no known quantity, and is excluded with an explicit partial-total warning until the quantity is provided.

The server-side refresh script validates stock response symbols and USD currency. CoinGecko IDs and symbols are validated against its catalog on every run, including `jito-staked-sol`, `pi-network` (not IOU), `flare-networks`, `zebec-network`, `world-liberty-financial`, and `official-trump`. JitoSOL uses its own price. Missing prices are null, never zero. Combined/subportfolio valuations are labeled partial where applicable; allocation remains undefined until the full portfolio can be valued.

Yahoo public chart data is delayed, unofficial, and has no availability guarantee. Every quote displays its status and its provider timestamp in the details dialog. Daily stock change uses the previous session's close, not the chart range's beginning. Crypto daily change is rolling 24h. Total return uses screenshot average cost and excludes dividends, fees, and realized transactions.

CoinGecko and Google News RSS are public feeds. News summaries are explicitly headline-derived rather than invented article summaries. Article links use Google News's publisher redirects. News groups span all holdings; relevance is to a watch group, not a claim that every tagged symbol is mentioned in each article.

## Refresh and alerts

GitHub Actions fetches prices/news and publishes Pages on each main-branch push, manual dispatch, and at minutes 7, 22, 37, and 52 every hour. GitHub may delay or skip scheduled runs. The dashboard polls published `data/market.json` every 60 seconds while open. Quote timestamps, stale snapshots, market-closed/delayed statuses, and unavailable data are exposed. Snapshot older than 60 minutes or CoinGecko quotes older than 30 minutes suppress relevant price alerts. Weekends retain delayed stock closing quotes with their timestamps.

Popup alerts require the page to remain open. Configurable price-above/below, absolute daily move, and allocation-above conditions trigger on entry into the condition, with a configurable cooldown. Seen news IDs and alert state persist locally to prevent repeated popups after reloads. The initial article batch establishes a baseline without spamming historical headlines. Browser background throttling can delay checks. There is no server-side push/email/SMS service.

No credentials are included in client files. Public feeds work without credentials in the initial verified fetch. If CoinGecko later requires authentication, an optional demo key belongs in the repository Actions secret `COINGECKO_DEMO_API_KEY`; the script sends it only in a server-side request header. Do not enter keys into public JavaScript or chat.

## Development

Requires Python 3.12+ and Node 22+; no package install is needed.

```sh
npm test
python3 -m unittest discover -s scripts -p 'test_*.py'
python3 scripts/refresh.py
npm start
```

GitHub Pages configuration and successful hosted verification are recorded in `VERIFICATION.md` once completed. A workflow cannot enable Pages if its token lacks repository administration permission; that is a deployment permission blocker, not a provider credential problem.
