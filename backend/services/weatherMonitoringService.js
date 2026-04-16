/**
 * Weather monitoring service.
 *
 * Polls OpenWeatherMap every 30 minutes for a list of major Indian
 * delivery cities, checks real-time weather + AQI against the parametric
 * trigger thresholds, and automatically creates DisruptionEvent documents
 * when a threshold is exceeded.
 *
 * Duplicate-event guard: a new event is only created if no event of the
 * same type + city exists with a start time within the last 2 hours.
 */

'use strict';

const DisruptionEvent = require('../models/DisruptionEvent');
const { fetchCurrentWeatherConditionsForCity } = require('../utils/weatherApiClient');
const { fetchCurrentAirQualityIndexForLocation } = require('../utils/pollutionApiClient');
const { identifyTriggeredDisruptionEventTypes } = require('./disruptionThresholdChecker');

// Major Indian cities where delivery partners operate.
const MONITORED_INDIAN_CITIES = [
  { name: 'Chennai',    latitude: 13.0827, longitude: 80.2707 },
  { name: 'Mumbai',     latitude: 19.0760, longitude: 72.8777 },
  { name: 'Delhi',      latitude: 28.6139, longitude: 77.2090 },
  { name: 'Bengaluru',  latitude: 12.9716, longitude: 77.5946 },
  { name: 'Hyderabad',  latitude: 17.3850, longitude: 78.4867 },
  { name: 'Kolkata',    latitude: 22.5726, longitude: 88.3639 },
  { name: 'Pune',       latitude: 18.5204, longitude: 73.8567 },
  { name: 'Ahmedabad',  latitude: 23.0225, longitude: 72.5714 },
  { name: 'Jaipur',     latitude: 26.9124, longitude: 75.7873 },
  { name: 'Lucknow',    latitude: 26.8467, longitude: 80.9462 },
  { name: 'Surat',      latitude: 21.1702, longitude: 72.8311 },
  { name: 'Indore',     latitude: 22.7196, longitude: 75.8577 },
];

const WEATHER_MONITOR_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const DUPLICATE_EVENT_WINDOW_MS   = 2  * 60 * 60 * 1000; // 2 hours

let monitoringIntervalHandle = null;

// ─── Core Check Logic ─────────────────────────────────────────────────────────

/**
 * Fetches weather + AQI for a single city, checks thresholds, and creates
 * DisruptionEvent records for any newly breached conditions.
 *
 * @param {{ name: string, latitude: number, longitude: number }} city
 * @returns {Promise<{ city: string, eventsCreated: string[] }>}
 */
async function checkCityAndCreateDisruptionEvents(city) {
  const eventsCreated = [];

  let weatherData = null;
  let aqiData = null;

  try {
    weatherData = await fetchCurrentWeatherConditionsForCity(city.name);
  } catch (weatherFetchError) {
    console.warn(
      `[WeatherMonitor] Failed to fetch weather for ${city.name}: ${weatherFetchError.message}`
    );
  }

  try {
    aqiData = await fetchCurrentAirQualityIndexForLocation(
      city.latitude,
      city.longitude
    );
  } catch (aqiFetchError) {
    console.warn(
      `[WeatherMonitor] Failed to fetch AQI for ${city.name}: ${aqiFetchError.message}`
    );
  }

  const currentEnvironmentalConditions = {
    rainfallInMillimetres:  weatherData?.rainfallInMillimetres  ?? undefined,
    temperatureInCelsius:   weatherData?.temperatureInCelsius   ?? undefined,
    airQualityIndex:        aqiData?.airQualityIndex            ?? undefined,
  };

  const triggeredEventTypes = identifyTriggeredDisruptionEventTypes(
    currentEnvironmentalConditions
  );

  if (triggeredEventTypes.length === 0) {
    return { city: city.name, eventsCreated };
  }

  const duplicateWindowStart = new Date(Date.now() - DUPLICATE_EVENT_WINDOW_MS);

  for (const eventType of triggeredEventTypes) {
    // Guard against duplicate events in the same window.
    const recentEventExists = await DisruptionEvent.exists({
      disruptionType:         eventType,
      affectedCityName:       { $regex: new RegExp(`^${city.name}$`, 'i') },
      disruptionStartTimestamp: { $gte: duplicateWindowStart },
    });

    if (recentEventExists) {
      console.log(
        `[WeatherMonitor] Skipping duplicate ${eventType} for ${city.name} — ` +
          'event already exists within the last 2 hours.'
      );
      continue;
    }

    const newDisruptionEvent = new DisruptionEvent({
      disruptionType: eventType,
      affectedCityName: city.name,
      affectedZoneCentreCoordinates: {
        latitude:  city.latitude,
        longitude: city.longitude,
      },
      affectedRadiusInKilometres:    15,
      measuredRainfallInMillimetres: weatherData?.rainfallInMillimetres  ?? null,
      measuredTemperatureInCelsius:  weatherData?.temperatureInCelsius   ?? null,
      measuredAirQualityIndex:       aqiData?.airQualityIndex            ?? null,
      disruptionStartTimestamp:      new Date(),
      weatherApiDataSourceName:      'openweathermap_auto_monitor',
    });

    await newDisruptionEvent.save();

    eventsCreated.push(eventType);
    console.log(
      `[WeatherMonitor] ⚠️  Created disruption event: ${eventType} in ${city.name} ` +
        `(rainfall=${weatherData?.rainfallInMillimetres ?? 'N/A'} mm, ` +
        `temp=${weatherData?.temperatureInCelsius ?? 'N/A'} °C, ` +
        `AQI=${aqiData?.airQualityIndex ?? 'N/A'})`
    );
  }

  return { city: city.name, eventsCreated };
}

/**
 * Runs a single monitoring cycle across all configured Indian cities.
 *
 * @returns {Promise<{ checkedAt: Date, totalEventsCreated: number, cityResults: object[] }>}
 */
async function runWeatherMonitoringCycle() {
  console.log('[WeatherMonitor] Starting monitoring cycle for all cities…');
  const checkedAt = new Date();

  const cityCheckPromises = MONITORED_INDIAN_CITIES.map((city) =>
    checkCityAndCreateDisruptionEvents(city).catch((err) => ({
      city: city.name,
      eventsCreated: [],
      error: err.message,
    }))
  );

  const cityResults = await Promise.all(cityCheckPromises);

  const totalEventsCreated = cityResults.reduce(
    (total, result) => total + (result.eventsCreated?.length || 0),
    0
  );

  console.log(
    `[WeatherMonitor] Cycle complete. Cities checked: ${MONITORED_INDIAN_CITIES.length}, ` +
      `new disruption events created: ${totalEventsCreated}`
  );

  return { checkedAt, totalEventsCreated, cityResults };
}

// ─── Lifecycle ─────────────────────────────────────────────────────────────────

/**
 * Starts the automatic weather monitoring loop.
 * Runs an immediate check, then repeats every 30 minutes.
 */
function startWeatherMonitoring() {
  if (!process.env.WEATHER_API_KEY) {
    console.warn(
      '[WeatherMonitor] WEATHER_API_KEY is not set — weather monitoring disabled.'
    );
    return;
  }

  console.log(
    `[WeatherMonitor] Starting — will poll every ${WEATHER_MONITOR_INTERVAL_MS / 60000} minutes.`
  );

  // Run immediately on startup.
  runWeatherMonitoringCycle().catch((err) =>
    console.error('[WeatherMonitor] Initial cycle failed:', err.message)
  );

  monitoringIntervalHandle = setInterval(() => {
    runWeatherMonitoringCycle().catch((err) =>
      console.error('[WeatherMonitor] Cycle failed:', err.message)
    );
  }, WEATHER_MONITOR_INTERVAL_MS);
}

/**
 * Stops the automatic monitoring loop (used for graceful shutdown / tests).
 */
function stopWeatherMonitoring() {
  if (monitoringIntervalHandle) {
    clearInterval(monitoringIntervalHandle);
    monitoringIntervalHandle = null;
    console.log('[WeatherMonitor] Monitoring stopped.');
  }
}

module.exports = {
  startWeatherMonitoring,
  stopWeatherMonitoring,
  runWeatherMonitoringCycle,
  checkCityAndCreateDisruptionEvents,
  MONITORED_INDIAN_CITIES,
};
