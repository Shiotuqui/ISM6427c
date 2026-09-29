# ISM6427c — Boca Weather

A responsive weather app powered by the free [Open-Meteo](https://open-meteo.com/) API (no key, account, or payment needed). Built for Dr. Lee, it defaults to **Florida Atlantic University, Boca Raton, FL**.

## Features
- Live current conditions, next-24-hour and 7-day forecasts (auto-refresh every 10 minutes)
- Personalized time-of-day greeting for Dr. Lee
- Light, Dark, and System themes (choice is remembered)
- City search (Open-Meteo Geocoding), "My location", and a one-click return to Boca
- °F / °C toggle
- Responsive layout for desktop browsers, tablets, and phones

## Run locally
No build step — it's plain HTML, CSS, and JavaScript:
```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy to Netlify
`netlify.toml` publishes the repository root with no build command.
1. In Netlify, choose **Add new site → Import an existing project** and pick this repo.
2. Branch: `main`. Leave the build command empty; the publish directory is `.` (already set in `netlify.toml`).
3. Deploy.

Or drag and drop the project folder onto https://app.netlify.com/drop.
