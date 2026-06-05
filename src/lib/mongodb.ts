import { MongoClient } from "mongodb";

const options = {};

let client: MongoClient;
let clientPromise: Promise<MongoClient> | undefined;

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function createClientPromise() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is required");
  }

  client = new MongoClient(uri, options);
  return client.connect();
}

export function getMongoClient() {
  if (process.env.NODE_ENV === "development") {
    if (!global._mongoClientPromise) {
      global._mongoClientPromise = createClientPromise();
    }

    return global._mongoClientPromise;
  }

  if (!clientPromise) {
    clientPromise = createClientPromise();
  }

  return clientPromise;
}
