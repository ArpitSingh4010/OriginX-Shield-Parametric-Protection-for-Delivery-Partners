/**
 * Database configuration for MongoDB connection.
 * Centralises all database-related settings to make environment
 * switching (development / staging / production) straightforward.
 */

const mongoose = require('mongoose');

const MONGODB_CONNECTION_URI = process.env.MONGODB_URI;
let activeConnectionPromise = null;

const MONGOOSE_CONNECTION_OPTIONS = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
};

/**
 * Establishes a connection to the MongoDB database.
 * Logs a success message on connection and an error message on failure.
 *
 * @returns {Promise<void>}
 */
async function connectToDatabase() {
  if (!MONGODB_CONNECTION_URI) {
    throw new Error('MONGODB_URI environment variable is not configured.');
  }

  // readyState: 1 = connected, 2 = connecting.
  if (mongoose.connection.readyState === 1) {
    return;
  }

  if (activeConnectionPromise) {
    await activeConnectionPromise;
    return;
  }

  activeConnectionPromise = mongoose
    .connect(MONGODB_CONNECTION_URI, MONGOOSE_CONNECTION_OPTIONS)
    .then(() => {
      console.log('Successfully connected to MongoDB database');
    })
    .finally(() => {
      activeConnectionPromise = null;
    });

  await activeConnectionPromise;
}

/**
 * Gracefully closes the MongoDB database connection.
 *
 * @returns {Promise<void>}
 */
async function disconnectFromDatabase() {
  await mongoose.disconnect();
  console.log('Disconnected from MongoDB database');
}

module.exports = {
  connectToDatabase,
  disconnectFromDatabase,
  MONGODB_CONNECTION_URI,
};
