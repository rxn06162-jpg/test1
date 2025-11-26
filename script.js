class WeatherMap {
  constructor() {
    this.map = null;
    this.marker = null;
    this.elements = {
      locationName: document.getElementById('location-name'),
      coordinates: document.getElementById('coordinates'),
      localTime: document.getElementById('local-time'),
      currentWeather: document.getElementById('current-weather-content'),
      forecastBody: document.getElementById('forecast-body'),
      status: document.getElementById('status-message')
    };

    this.defaultCoords = { lat: 35.6804, lng: 139.769 }; // Tokyo Station
    this.init();
  }

  init() {
    this.setupMap();
    this.setupEventListeners();
  }

  setupMap() {
    this.map = L.map('map').setView([this.defaultCoords.lat, this.defaultCoords.lng], 6);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);

    this.map.on('click', (e) => this.handleMapClick(e.latlng));

    // ensure the map renders after layout is applied
    this.map.whenReady(() => {
      this.map.invalidateSize();
      setTimeout(() => this.map.invalidateSize(), 100);
    });
  }

  setupEventListeners() {
    window.addEventListener('resize', () => {
      if (this.map) {
        this.map.invalidateSize();
      }
    });
  }

  async handleMapClick(latlng) {
    const { lat, lng } = this.normalizeCoordinates(latlng.lat, latlng.lng);
    this.updateCoordinates(lat, lng);
    this.setStatus('データ取得中...');

    try {
      const [weatherData, locationName] = await Promise.all([
        this.fetchWeatherData(lat, lng),
        this.fetchLocationName(lat, lng)
      ]);

      if (!weatherData) {
        throw new Error('気象データの取得に失敗しました。');
      }

      this.placeMarker(lat, lng);
      this.displayLocation(locationName, lat, lng, weatherData.timezone);
      this.displayCurrentWeather(weatherData.current, weatherData.timezone, locationName);
      this.displayForecast(weatherData.hourly, weatherData.current.time, weatherData.timezone);
      this.showWeatherPopup(lat, lng, weatherData.current, locationName, weatherData.timezone);
      this.setStatus('最新のデータを表示しています。');
    } catch (error) {
      console.error(error);
      this.setStatus('データ取得中にエラーが発生しました。しばらくしてから再度お試しください。');
    }
  }

  placeMarker(lat, lng) {
    if (this.marker) {
      this.marker.setLatLng([lat, lng]);
    } else {
      this.marker = L.marker([lat, lng]).addTo(this.map);
    }
  }

  updateCoordinates(lat, lng) {
    this.elements.coordinates.textContent = `緯度: ${lat.toFixed(4)} / 経度: ${lng.toFixed(4)}`;
  }

  displayLocation(locationName, lat, lng, timezone) {
    this.elements.locationName.textContent = locationName || '地名取得中...';
    const localTime = new Date().toLocaleString('ja-JP', {
      timeZone: timezone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
    this.elements.localTime.textContent = `現地時刻 (${timezone}): ${localTime}`;
    this.updateCoordinates(lat, lng);
  }

  async fetchWeatherData(lat, lng) {
    const params = new URLSearchParams({
      latitude: lat,
      longitude: lng,
      current: ['temperature_2m', 'relative_humidity_2m', 'precipitation', 'wind_speed_10m', 'weather_code'].join(','),
      hourly: ['temperature_2m', 'precipitation', 'wind_speed_10m', 'weather_code'].join(','),
      forecast_days: 2,
      timezone: 'auto',
      timeformat: 'iso8601'
    });

    const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('気象API呼び出しに失敗しました。');
    }

    const data = await response.json();
    if (!data.current || !data.hourly) {
      return null;
    }

    return {
      current: data.current,
      hourly: data.hourly,
      timezone: data.timezone
    };
  }

  async fetchLocationName(lat, lng) {
    const params = new URLSearchParams({
      lat: lat,
      lon: lng,
      format: 'json',
      'accept-language': 'ja',
      zoom: 10
    });

    const url = `https://nominatim.openstreetmap.org/reverse?${params.toString()}`;
    const response = await fetch(url);

    if (!response.ok) {
      return '地名の取得に失敗しました';
    }

    const data = await response.json();
    return data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }

  displayCurrentWeather(currentWeather, timezone, locationName) {
    if (!currentWeather) {
      this.elements.currentWeather.textContent = '現在の天気情報を取得できませんでした。';
      return;
    }

    const weatherInfo = this.getWeatherInfo(currentWeather.weather_code);
    const nowString = new Date().toLocaleString('ja-JP', {
      timeZone: timezone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    const template = `
      <div class="weather-main">
        <div class="icon">${weatherInfo.icon}</div>
        <div>
          <div style="font-weight:600; font-size:1rem;">${weatherInfo.label}</div>
          <div style="color: var(--muted);">${locationName || '---'}</div>
          <div style="color: var(--muted); font-size:0.9rem;">${nowString}</div>
        </div>
      </div>
      <div class="weather-details">
        <div>気温: <strong>${currentWeather.temperature_2m ?? '---'}°C</strong></div>
        <div>風速: <strong>${currentWeather.wind_speed_10m ?? '---'} km/h</strong></div>
        <div>湿度: <strong>${currentWeather.relative_humidity_2m ?? '---'}%</strong></div>
        <div>降水量: <strong>${currentWeather.precipitation ?? '---'} mm</strong></div>
      </div>
    `;

    this.elements.currentWeather.innerHTML = template;
  }

  displayForecast(hourlyData, currentTime, timezone) {
    const body = this.elements.forecastBody;
    body.innerHTML = '';
    if (!hourlyData || !hourlyData.time) {
      body.innerHTML = '<tr><td colspan="5">予報データを取得できませんでした。</td></tr>';
      return;
    }

    const startIndex = Math.max(0, hourlyData.time.indexOf(currentTime));
    const endIndex = startIndex + 24;

    for (let i = startIndex; i < endIndex && i < hourlyData.time.length; i++) {
      const time = hourlyData.time[i];
      const hourLabel = this.formatTimeLabel(time, timezone);
      const weatherInfo = this.getWeatherInfo(hourlyData.weather_code[i]);
      const temp = hourlyData.temperature_2m[i];
      const precip = hourlyData.precipitation[i];
      const wind = hourlyData.wind_speed_10m[i];

      const tempColor = this.getHeatmapColor(temp, -10, 35, 'temperature');
      const precipColor = this.getHeatmapColor(precip, 0, 20, 'precipitation');
      const windColor = this.getHeatmapColor(wind, 0, 60, 'wind');

      const row = document.createElement('tr');
      row.innerHTML = `
        <td class="time-col">${hourLabel}</td>
        <td class="weather-col">${weatherInfo.icon} ${weatherInfo.label}</td>
        <td style="background:${tempColor}; color:${this.getContrastColor(tempColor)};">${temp?.toFixed(1) ?? '--'}</td>
        <td style="background:${precipColor}; color:${this.getContrastColor(precipColor)};">${precip?.toFixed(1) ?? '--'}</td>
        <td style="background:${windColor}; color:${this.getContrastColor(windColor)};">${wind?.toFixed(1) ?? '--'}</td>
      `;
      body.appendChild(row);
    }
  }

  showWeatherPopup(lat, lng, currentWeather, locationName, timezone) {
    const weatherInfo = this.getWeatherInfo(currentWeather.weather_code);
    const localTime = new Date().toLocaleString('ja-JP', {
      timeZone: timezone,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });

    const popupContent = `
      <div style="font-weight:600; margin-bottom:4px;">${locationName || '選択した地点'}</div>
      <div>${weatherInfo.icon} ${weatherInfo.label}</div>
      <div style="color:#6c757d; font-size:0.9rem;">${localTime} (${timezone})</div>
      <div style="margin-top:6px;">気温: ${currentWeather.temperature_2m}°C / 風速: ${currentWeather.wind_speed_10m} km/h</div>
    `;

    this.marker.bindPopup(popupContent).openPopup();
  }

  normalizeCoordinates(lat, lng) {
    const normalizedLat = Math.max(-90, Math.min(90, lat));
    const normalizedLng = ((lng + 180) % 360 + 360) % 360 - 180;
    return { lat: normalizedLat, lng: normalizedLng };
  }

  getWeatherInfo(weatherCode) {
    const mapping = {
      0: { label: '快晴', icon: '☀️' },
      1: { label: '晴れ', icon: '🌤️' },
      2: { label: '薄曇り', icon: '⛅' },
      3: { label: '曇り', icon: '☁️' },
      45: { label: '霧', icon: '🌫️' },
      48: { label: '濃霧', icon: '🌫️' },
      51: { label: '霧雨（弱）', icon: '🌦️' },
      53: { label: '霧雨（中）', icon: '🌧️' },
      55: { label: '霧雨（強）', icon: '🌧️' },
      56: { label: '着氷性の霧雨（弱）', icon: '🌧️' },
      57: { label: '着氷性の霧雨（強）', icon: '🌧️' },
      61: { label: '雨（弱）', icon: '🌦️' },
      63: { label: '雨（中）', icon: '🌧️' },
      65: { label: '雨（強）', icon: '🌧️' },
      66: { label: '着氷性の雨（弱）', icon: '🌧️' },
      67: { label: '着氷性の雨（強）', icon: '🌧️' },
      71: { label: '雪（弱）', icon: '🌨️' },
      73: { label: '雪（中）', icon: '❄️' },
      75: { label: '雪（強）', icon: '❄️' },
      77: { label: '雪粒', icon: '🌨️' },
      80: { label: 'にわか雨（弱）', icon: '🌦️' },
      81: { label: 'にわか雨（中）', icon: '🌦️' },
      82: { label: 'にわか雨（強）', icon: '⛈️' },
      85: { label: 'にわか雪（弱）', icon: '🌨️' },
      86: { label: 'にわか雪（強）', icon: '❄️' },
      95: { label: '雷雨', icon: '⛈️' },
      96: { label: '雷雨（雹を伴う）', icon: '⛈️' },
      99: { label: '雷雨（雹を伴う強）', icon: '⛈️' }
    };

    return mapping[weatherCode] || { label: '不明', icon: '❔' };
  }

  getHeatmapColor(value, min, max, type) {
    if (value === undefined || value === null || isNaN(value)) {
      return '#f8f9fa';
    }
    const clamped = Math.max(min, Math.min(max, value));
    const ratio = (clamped - min) / (max - min);

    switch (type) {
      case 'temperature':
        return this.interpolateColor(ratio, [
          { stop: 0, color: '#1e90ff' },
          { stop: 0.5, color: '#ffd166' },
          { stop: 1, color: '#ef476f' }
        ]);
      case 'precipitation':
        return this.interpolateColor(ratio, [
          { stop: 0, color: '#ffffff' },
          { stop: 0.5, color: '#a6e1ff' },
          { stop: 1, color: '#2196f3' }
        ]);
      case 'wind':
        return this.interpolateColor(ratio, [
          { stop: 0, color: '#ffffff' },
          { stop: 0.5, color: '#c7f9cc' },
          { stop: 1, color: '#2d6a4f' }
        ]);
      default:
        return '#f8f9fa';
    }
  }

  interpolateColor(value, colorStops) {
    const sorted = colorStops.sort((a, b) => a.stop - b.stop);
    const lower = sorted.reduce((acc, stop) => (stop.stop <= value ? stop : acc), sorted[0]);
    const upper = sorted.find((stop) => stop.stop >= value) || sorted[sorted.length - 1];

    if (lower === upper) return lower.color;

    const range = upper.stop - lower.stop;
    const weight = (value - lower.stop) / range;

    const lowerRgb = this.hexToRgb(lower.color);
    const upperRgb = this.hexToRgb(upper.color);

    const r = Math.round(lowerRgb.r + (upperRgb.r - lowerRgb.r) * weight);
    const g = Math.round(lowerRgb.g + (upperRgb.g - lowerRgb.g) * weight);
    const b = Math.round(lowerRgb.b + (upperRgb.b - lowerRgb.b) * weight);

    return `rgb(${r}, ${g}, ${b})`;
  }

  hexToRgb(hex) {
    const sanitized = hex.replace('#', '');
    const bigint = parseInt(sanitized, 16);
    return {
      r: (bigint >> 16) & 255,
      g: (bigint >> 8) & 255,
      b: bigint & 255
    };
  }

  getContrastColor(rgbColor) {
    const values = rgbColor
      .replace('rgb(', '')
      .replace(')', '')
      .split(',')
      .map((v) => parseInt(v.trim(), 10));
    const [r, g, b] = values;
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? '#212529' : '#f8f9fa';
  }

  formatTimeLabel(time, timezone) {
    if (!time) return '--:--';
    const date = new Date(`${time}Z`);
    return date.toLocaleString('ja-JP', {
      timeZone: timezone,
      hour12: false,
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  setStatus(message) {
    this.elements.status.textContent = message;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new WeatherMap();
});
