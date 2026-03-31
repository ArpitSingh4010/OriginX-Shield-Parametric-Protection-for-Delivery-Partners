/**
 * HTTP client utility for the external Air Quality / Pollution API.
 *
 * Fetches the current Air Quality Index (AQI) for a specified city.
 * The raw API response is normalised into the internal data format
 * used by the disruption threshold checker.
 */

const https = require('https');

const POLLUTION_API_BASE_URL =
  process.env.POLLUTION_API_BASE_URL || 'https://api.openweathermap.org/data/2.5';
const POLLUTION_API_KEY = process.env.POLLUTION_API_KEY || process.env.WEATHER_API_KEY || '';

/**
 * Makes an HTTPS GET request to the given URL and resolves with the
 * parsed JSON response body.
 *
 * @param {string} requestUrl - The full URL to fetch.
 * @returns {Promise<object>} Parsed JSON response body.
 */
function fetchJsonFromUrl(requestUrl) {
  return new Promise((resolve, reject) => {
    https.get(requestUrl, (response) => {
      let rawResponseBody = '';

      response.on('data', (responseChunk) => {
        rawResponseBody += responseChunk;
      });

      response.on('end', () => {
        try {
          const parsedResponseBody = JSON.parse(rawResponseBody);
          resolve(parsedResponseBody);
        } catch (jsonParseError) {
          reject(
            new Error(`Failed to parse pollution API response: ${jsonParseError.message}`)
          );
        }
      });
    }).on('error', (networkError) => {
      reject(new Error(`Pollution API network request failed: ${networkError.message}`));
    });
  });
}

/**
 * Retrieves the current Air Quality Index for a geographic coordinate
 * pair from the Pollution API.
 *
 * @param {number} latitudeOfLocation - Latitude of the location to query.
 * @param {number} longitudeOfLocation - Longitude of the location to query.
 * @returns {Promise<{
 *   airQualityIndex: number,
 *   dominantPollutantName: string,
 *   dataFetchedAtTimestamp: Date
 * }>} Normalised AQI data object.
 */
async function fetchCurrentAirQualityIndexForLocation(
  latitudeOfLocation,
  longitudeOfLocation
) {
  if (!POLLUTION_API_KEY) {
    throw new Error(
      'POLLUTION_API_KEY environment variable is not set. ' +
        'Cannot fetch live air quality data.'
    );
  }

  const pollutionApiRequestUrl =
    `${POLLUTION_API_BASE_URL}/air_pollution?lat=${latitudeOfLocation}` +
    `&lon=${longitudeOfLocation}&appid=${POLLUTION_API_KEY}`;

  const rawPollutionApiResponse = await fetchJsonFromUrl(pollutionApiRequestUrl);

  if (!rawPollutionApiResponse.list || rawPollutionApiResponse.list.length === 0) {
    throw new Error(
      `Pollution API returned no data for coordinates ` +
        `(${latitudeOfLocation}, ${longitudeOfLocation}).`
    );
  }

  const latestPollutionReading = rawPollutionApiResponse.list[0];

  // OpenWeatherMap AQI scale: 1=Good, 2=Fair, 3=Moderate, 4=Poor, 5=VeryPoor
  // Map to approximate numeric AQI (0-500 scale used in GigShield)
  const openWeatherAqiToNumericMapping = {
    1: 50,
    2: 100,
    3: 150,
    4: 250,
    5: 350,
  };

  const openWeatherAqiCategory = latestPollutionReading.main.aqi;
  const mappedNumericAirQualityIndex =
    openWeatherAqiToNumericMapping[openWeatherAqiCategory] || 0;

  const componentsPollutantConcentrations = latestPollutionReading.components;
  const dominantPollutantName = Object.entries(componentsPollutantConcentrations).sort(
    ([, concentrationA], [, concentrationB]) => concentrationB - concentrationA
  )[0][0];

  return {
    airQualityIndex: mappedNumericAirQualityIndex,
    dominantPollutantName,
    dataFetchedAtTimestamp: new Date(),
  };
}

module.exports = {
  fetchCurrentAirQualityIndexForLocation,
};
