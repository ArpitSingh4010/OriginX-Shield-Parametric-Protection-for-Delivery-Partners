/**
 * Database configuration for MongoDB connection.
 * Centralises all database-related settings to make environment
 * switching (development / staging / production) straightforward.
 */

const mongoose = require('mongoose');

const MONGODB_CONNECTION_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27017/gigshield';

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
  try {
    await mongoose.connect(MONGODB_CONNECTION_URI, MONGOOSE_CONNECTION_OPTIONS);
    console.log('Successfully connected to MongoDB database');
  } catch (databaseConnectionError) {
    console.error(
      'Failed to connect to MongoDB database:',
      databaseConnectionError.message
    );
    process.exit(1);
  }
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
