import neo4j from "neo4j-driver";

export const URI = "neo4j://localhost";
export const USER = "neo4j";
export const PASSWORD = "testtest"; // Make sure to use environment variables for credentials in production

// Create a single driver instance to reuse across the application
export const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));

// Ensure the driver is closed when the application exits
process.on("SIGINT", async () => {
  console.log("Closing Neo4j driver...");
  await driver.close();
  process.exit(0);
});
