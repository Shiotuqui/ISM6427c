(() => {
  'use strict';

  // Default location: Florida Atlantic University, Boca Raton, FL
  const DEFAULT_LOCATION = {
    name: 'Boca Raton',
    region: 'Florida (FAU)',
    latitude: 26.3728,
    longitude: -80.1034,
  };
  const USER_NAME = 'Senhor Shush';
  const REFRESH_MS = 10 * 60 * 1000; // refresh live data every 10 minutes

  const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
  const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';

  // WMO weather codes -> description + day/night icon
  const WEATHER_CODES = {
    0: ['Clear sky', '☀️', '🌙'],
    1: ['Mainly clear', '🌤️', '🌙'],
    2: ['Partly cloudy', '⛅', '☁️'],
    3: ['Overcast', '☁️', '☁️'],
    45: ['Fog', '🌫️', '🌫️'],
    48: ['Depositing rime fog', '🌫️', '🌫️'],
    51: ['Light drizzle', '🌦️', '🌧️'],
    53: ['Drizzle', '🌦️', '🌧️'],
    55: ['Dense drizzle', '🌧️', '🌧️'],
    56: ['Freezing drizzle', '🌧️', '🌧️'],
    57: ['Dense freezing drizzle', '🌧️', '🌧️'],
    61: ['Light rain', '🌦️', '🌧️'],
    63: ['Rain', '🌧️', '🌧️'],
    65: ['Heavy rain', '🌧️', '🌧️'],
    66: ['Freezing rain', '🌧️', '🌧️'],
    67: ['Heavy freezing rain', '🌧️', '🌧️'],
    71: ['Light snow', '🌨️', '🌨️'],
    73: ['Snow', '🌨️', '🌨️'],
    75: ['Heavy snow', '❄️', '❄️'],
    77: ['Snow grains', '🌨️', '🌨️'],
    80: ['Light showers', '🌦️', '🌧️'],
    81: ['Showers', '🌧️', '🌧️'],
    82: ['Violent showers', '⛈️', '⛈️'],
    85: ['Snow showers', '🌨️', '🌨️'],
    86: ['Heavy snow showers', '❄️', '❄️'],
    95: ['Thunderstorm', '⛈️', '⛈️'],
    96: ['Thunderstorm with hail', '⛈️', '⛈️'],
    99: ['Severe thunderstorm with hail', '⛈️', '⛈️'],
  };

  const $ = (id) => document.getElementById(id);

  const storage = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, val) { try { localStorage.setItem(key, val); } catch (e) { /* ignore */ } },
  };

  const state = {
    location: DEFAULT_LOCATION,
    units: storage.get('units') === 'metric' ? 'metric' : 'imperial',
    data: null,
    refreshTimer: null,
    requestId: 0,
  };

  /* ---------------- Theme ---------------- */

  const themeButtons = document.querySelectorAll('[data-theme-choice]');

  function applyTheme(choice) {
    const root = document.documentElement;
    if (choice === 'light' || choice === 'dark') root.setAttribute('data-theme', choice);
    else root.removeAttribute('data-theme');
    themeButtons.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeChoice === choice)));
    storage.set('theme', choice);
  }

  themeButtons.forEach((b) => b.addEventListener('click', () => applyTheme(b.dataset.themeChoice)));
  applyTheme(storage.get('theme') || 'system');
  // "System" removes data-theme, so the CSS media query follows OS changes automatically.

  /* ---------------- Greeting ---------------- */

  function renderGreeting() {
    const h = new Date().getHours();
    let part = 'evening';
    if (h >= 5 && h < 12) part = 'morning';
    else if (h >= 12 && h < 17) part = 'afternoon';
    const firstVisit = !storage.get('visited');
    $('greeting-title').textContent = `Good ${part}, ${USER_NAME}! 👋`;
    $('greeting-sub').textContent = firstVisit
      ? 'Welcome to your weather app. Here are live conditions for Boca Raton.'
      : 'Welcome back! Here are the latest live conditions.';
    storage.set('visited', '1');
  }

  /* ---------------- Formatting ---------------- */

  const describe = (code, isDay = 1) => {
    const entry = WEATHER_CODES[code] || ['Unknown', '🌡️', '🌡️'];
    return { text: entry[0], icon: isDay ? entry[1] : entry[2] };
  };

  const tempUnit = () => (state.units === 'imperial' ? '°F' : '°C');
  const fmtTemp = (v) => (v == null ? '--' : `${Math.round(v)}°`);
  const fmtWind = (v) => (v == null ? '--' : `${Math.round(v)} ${state.units === 'imperial' ? 'mph' : 'km/h'}`);
  const fmtPrecip = (v) => (v == null ? '--' : `${v.toFixed(state.units === 'imperial' ? 2 : 1)} ${state.units === 'imperial' ? 'in' : 'mm'}`);

  function windDir(deg) {
    if (deg == null) return '';
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(deg / 45) % 8];
  }

  // Open-Meteo returns local times as "YYYY-MM-DDTHH:MM" in the location's timezone.
  // Parse these components directly so the display reflects the location's local time.
  function parseLocal(iso) {
    const [d, t = '00:00'] = iso.split('T');
    const [y, m, day] = d.split('-').map(Number);
    const [hh, mm] = t.split(':').map(Number);
    return { y, m, day, hh, mm };
  }
  function fmtClock(iso) {
    const { hh, mm } = parseLocal(iso);
    const h12 = hh % 12 || 12;
    return `${h12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
  }
  function fmtHour(iso) {
    const { hh } = parseLocal(iso);
    return `${hh % 12 || 12} ${hh < 12 ? 'AM' : 'PM'}`;
  }
  function fmtDay(iso, index) {
    if (index === 0) return 'Today';
    const { y, m, day } = parseLocal(iso);
    return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });
  }

  /* ---------------- Status ---------------- */

  function setStatus(msg, isError = false) {
    const el = $('status');
    if (!msg) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.textContent = msg;
    el.classList.toggle('error', isError);
  }

  /* ---------------- Data ---------------- */

  async function fetchWeather() {
    const { latitude, longitude } = state.location;
    const params = new URLSearchParams({
      latitude, longitude,
      current: [
        'temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'is_day',
        'precipitation', 'weather_code', 'pressure_msl', 'wind_speed_10m', 'wind_direction_10m',
      ].join(','),
      hourly: ['temperature_2m', 'weather_code', 'precipitation_probability', 'is_day'].join(','),
      daily: [
        'weather_code', 'temperature_2m_max', 'temperature_2m_min', 'sunrise', 'sunset',
        'uv_index_max', 'precipitation_probability_max',
      ].join(','),
      timezone: 'auto',
      forecast_days: 7,
      temperature_unit: state.units === 'imperial' ? 'fahrenheit' : 'celsius',
      wind_speed_unit: state.units === 'imperial' ? 'mph' : 'kmh',
      precipitation_unit: state.units === 'imperial' ? 'inch' : 'mm',
    });

    const reqId = ++state.requestId;
    $('current').setAttribute('aria-busy', 'true');
    try {
      const res = await fetch(`${FORECAST_URL}?${params}`);
      if (!res.ok) throw new Error(`Weather service responded ${res.status}`);
      const data = await res.json();
      if (reqId !== state.requestId) return; // a newer request superseded this one
      state.data = data;
      render();
      setStatus('');
    } catch (err) {
      if (reqId !== state.requestId) return;
      console.error(err);
      setStatus('Could not load live weather right now. Check your connection and try again.', true);
    } finally {
      if (reqId === state.requestId) $('current').setAttribute('aria-busy', 'false');
    }
  }

  function scheduleRefresh() {
    clearInterval(state.refreshTimer);
    state.refreshTimer = setInterval(fetchWeather, REFRESH_MS);
  }

  function loadLocation(loc) {
    state.location = loc;
    $('place-name').textContent = [loc.name, loc.region].filter(Boolean).join(', ');
    fetchWeather();
    scheduleRefresh();
  }

  /* ---------------- Render ---------------- */

  function render() {
    const d = state.data;
    if (!d) return;
    const c = d.current;
    const daily = d.daily;
    const cur = describe(c.weather_code, c.is_day);

    $('current-icon').textContent = cur.icon;
    $('current-temp').textContent = `${Math.round(c.temperature_2m)}${tempUnit()}`;
    $('current-desc').textContent = cur.text;
    $('current-hilo').textContent = `H: ${fmtTemp(daily.temperature_2m_max[0])}  L: ${fmtTemp(daily.temperature_2m_min[0])}`;
    $('updated').textContent = `Updated ${fmtClock(c.time)} local time`;

    $('stat-feels').textContent = fmtTemp(c.apparent_temperature);
    $('stat-humidity').textContent = `${Math.round(c.relative_humidity_2m)}%`;
    $('stat-wind').textContent = `${fmtWind(c.wind_speed_10m)} ${windDir(c.wind_direction_10m)}`.trim();
    $('stat-precip').textContent = fmtPrecip(c.precipitation);
    $('stat-uv').textContent = daily.uv_index_max[0] == null ? '--' : daily.uv_index_max[0].toFixed(1);
    $('stat-pressure').textContent = c.pressure_msl == null ? '--' : `${Math.round(c.pressure_msl)} hPa`;
    $('stat-sunrise').textContent = fmtClock(daily.sunrise[0]);
    $('stat-sunset').textContent = fmtClock(daily.sunset[0]);

    // Hourly: next 24 hours starting from the current hour
    const hourly = d.hourly;
    const nowHour = c.time.slice(0, 13); // "YYYY-MM-DDTHH"
    let start = hourly.time.findIndex((t) => t.slice(0, 13) === nowHour);
    if (start < 0) start = 0;
    const hourlyEl = $('hourly');
    hourlyEl.replaceChildren();
    for (let i = start; i < Math.min(start + 24, hourly.time.length); i++) {
      const w = describe(hourly.weather_code[i], hourly.is_day[i]);
      const div = document.createElement('div');
      div.className = 'hour';
      div.title = w.text;
      const pop = hourly.precipitation_probability[i];
      div.innerHTML = `
        <span class="t">${i === start ? 'Now' : fmtHour(hourly.time[i])}</span>
        <span class="i" aria-hidden="true">${w.icon}</span>
        <span class="v">${fmtTemp(hourly.temperature_2m[i])}</span>
        <span class="p">${pop == null ? '' : `💧${pop}%`}</span>`;
      hourlyEl.appendChild(div);
    }

    // Daily
    const dailyEl = $('daily');
    dailyEl.replaceChildren();
    daily.time.forEach((t, i) => {
      const w = describe(daily.weather_code[i], 1);
      const pop = daily.precipitation_probability_max[i];
      const li = document.createElement('li');
      li.className = 'day';
      li.innerHTML = `
        <span class="name">${fmtDay(t, i)}</span>
        <span class="icon" aria-hidden="true">${w.icon}</span>
        <span class="info">${w.text}${pop ? ` · 💧${pop}%` : ''}</span>
        <span class="range">${fmtTemp(daily.temperature_2m_max[i])}<span class="lo">${fmtTemp(daily.temperature_2m_min[i])}</span></span>`;
      dailyEl.appendChild(li);
    });
  }

  /* ---------------- Units ---------------- */

  const unitBtn = $('unit-btn');
  function renderUnitButton() {
    unitBtn.textContent = state.units === 'imperial' ? '°F → °C' : '°C → °F';
  }
  unitBtn.addEventListener('click', () => {
    state.units = state.units === 'imperial' ? 'metric' : 'imperial';
    storage.set('units', state.units);
    renderUnitButton();
    fetchWeather();
  });

  /* ---------------- Search ---------------- */

  const form = $('search-form');
  const input = $('search-input');
  const results = $('search-results');
  let searchTimer = null;
  let searchId = 0;

  function hideResults() {
    results.hidden = true;
    results.replaceChildren();
  }

  function selectPlace(p) {
    hideResults();
    input.value = '';
    loadLocation({
      name: p.name,
      region: [p.admin1, p.country_code === 'US' ? null : p.country].filter(Boolean).join(', '),
      latitude: p.latitude,
      longitude: p.longitude,
    });
  }

  async function searchPlaces(query, pickFirst = false) {
    const q = query.trim();
    if (q.length < 2) { hideResults(); return; }
    const id = ++searchId;
    try {
      const res = await fetch(`${GEOCODE_URL}?${new URLSearchParams({ name: q, count: 6, language: 'en', format: 'json' })}`);
      if (!res.ok) throw new Error(`Geocoding responded ${res.status}`);
      const data = await res.json();
      if (id !== searchId) return;
      const places = data.results || [];
      if (!places.length) {
        results.innerHTML = '<li class="sub">No matching places found.</li>';
        results.hidden = false;
        return;
      }
      if (pickFirst) { selectPlace(places[0]); return; }
      results.replaceChildren();
      places.forEach((p) => {
        const li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.tabIndex = -1;
        const sub = [p.admin1, p.country].filter(Boolean).join(', ');
        li.innerHTML = `<div></div><div class="sub"></div>`;
        li.children[0].textContent = p.name;
        li.children[1].textContent = sub;
        li.addEventListener('click', () => selectPlace(p));
        li.addEventListener('keydown', (e) => { if (e.key === 'Enter') selectPlace(p); });
        results.appendChild(li);
      });
      results.hidden = false;
    } catch (err) {
      console.error(err);
      setStatus('City search is unavailable right now.', true);
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => searchPlaces(input.value), 300);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && !results.hidden && results.firstElementChild) {
      e.preventDefault();
      results.firstElementChild.focus();
    } else if (e.key === 'Escape') hideResults();
  });
  results.addEventListener('keydown', (e) => {
    const cur = document.activeElement;
    if (e.key === 'ArrowDown' && cur.nextElementSibling) { e.preventDefault(); cur.nextElementSibling.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); (cur.previousElementSibling || input).focus(); }
    if (e.key === 'Escape') { hideResults(); input.focus(); }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(searchTimer);
    searchPlaces(input.value, true);
  });
  document.addEventListener('click', (e) => { if (!form.contains(e.target)) hideResults(); });

  /* ---------------- Location buttons ---------------- */

  $('home-btn').addEventListener('click', () => loadLocation(DEFAULT_LOCATION));

  const locateBtn = $('locate-btn');
  locateBtn.addEventListener('click', () => {
    if (!('geolocation' in navigator)) {
      setStatus('Geolocation is not supported by this browser.', true);
      return;
    }
    locateBtn.disabled = true;
    setStatus('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        locateBtn.disabled = false;
        loadLocation({
          name: 'My location',
          region: `${pos.coords.latitude.toFixed(2)}, ${pos.coords.longitude.toFixed(2)}`,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      () => {
        locateBtn.disabled = false;
        setStatus('Could not get your location. Showing the current location instead.', true);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  });

  // Refresh when the tab becomes visible again so data stays current.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') fetchWeather();
  });

  /* ---------------- Init ---------------- */

  renderGreeting();
  renderUnitButton();
  loadLocation(DEFAULT_LOCATION);
})();
