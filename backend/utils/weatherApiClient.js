/**
 * HTTP client utility for the external Weather API.
 *
 * Fetches current weather conditions (rainfall, temperature) for a
 * specified city.  The raw API response is normalised into the internal
 * data format used by the disruption threshold checker.
 */

const https = require('https');

const WEATHER_API_BASE_URL = process.env.WEATHER_API_BASE_URL || 'https://api.openweathermap.org/data/2.5';
const WEATHER_API_KEY = process.env.WEATHER_API_KEY || '';

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
          reject(new Error(`Failed to parse weather API response: ${jsonParseError.message}`));
        }
      });
    }).on('error', (networkError) => {
      reject(new Error(`Weather API network request failed: ${networkError.message}`));
    });
  });
}

/**
 * Retrieves current weather conditions for a city from the Weather API
 * and returns only the fields relevant to disruption detection.
 *
 * @param {string} cityName - The name of the city to fetch conditions for.
 * @returns {Promise<{
 *   cityName: string,
 *   rainfallInMillimetres: number,
 *   temperatureInCelsius: number,
 *   weatherConditionDescription: string,
 *   dataFetchedAtTimestamp: Date
 * }>} Normalised weather conditions object.
 */
async function fetchCurrentWeatherConditionsForCity(cityName) {
  if (!WEATHER_API_KEY) {
    throw new Error(
      'WEATHER_API_KEY environment variable is not set. ' +
        'Cannot fetch live weather data.'
    );
  }

  const weatherApiRequestUrl =
    `${WEATHER_API_BASE_URL}/weather?q=${encodeURIComponent(cityName)}` +
    `&appid=${WEATHER_API_KEY}&units=metric`;

  const rawWeatherApiResponse = await fetchJsonFromUrl(weatherApiRequestUrl);

  if (rawWeatherApiResponse.cod !== 200) {
    throw new Error(
      `Weather API returned an error for city "${cityName}": ` +
        rawWeatherApiResponse.message
    );
  }

  const rainfallInMillimetres =
    rawWeatherApiResponse.rain && rawWeatherApiResponse.rain['1h']
      ? rawWeatherApiResponse.rain['1h']
      : 0;

  const temperatureInCelsius = rawWeatherApiResponse.main.temp;
  const weatherConditionDescription = rawWeatherApiResponse.weather[0].description;

  return {
    cityName,
    rainfallInMillimetres,
    temperatureInCelsius,
    weatherConditionDescription,
    dataFetchedAtTimestamp: new Date(),
  };
}

module.exports = {
  fetchCurrentWeatherConditionsForCity,
};
