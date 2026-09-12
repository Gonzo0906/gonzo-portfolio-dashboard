# One-minute quote backend (prepared, not connected)

GitHub Actions schedules have a five-minute minimum, and Yahoo chart quotes do not permit direct browser CORS requests. A separate HTTP Worker fetches the exact 24 stock symbols and 15 verified CoinGecko IDs. It fetches on the open dashboard's 60-second requests, caches for at most 55 seconds, preserves provider timestamps, and never emits missing prices as zero. It does not receive quantities or cost basis from clients. This does not remove provider delays or caching.

Deployment requires an existing Cloudflare account and `CLOUDFLARE_API_TOKEN` plus `CLOUDFLARE_ACCOUNT_ID` repository Actions secrets. The token requires permission to deploy Worker scripts in that account (Cloudflare's Edit Cloudflare Workers token template). Supply credentials only through GitHub's encrypted Actions secrets interface; never chat or public client files.

Once supplied, run the prepared backend deployment workflow, verify its returned workers.dev `/prices` URL, then set that verified URL in public/feed-config.json and publish Pages. The assistant handles these steps. The endpoint has fixed provider URLs and asset IDs and is not a general proxy.

Until the endpoint is deployed and verified, the dashboard honestly retains its 15-minute published snapshot fallback. News stays on the 15-minute refresh; only prices move to 60 seconds.
