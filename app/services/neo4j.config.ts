/**
 * Neo4j Database Configuration
 * 
 * This file contains the configuration settings for connecting to the Neo4j database.
 * In a production environment, these values should be stored in environment variables.
 */

export const neo4jConfig = {
  uri: process.env.NEO4J_URI || "neo4j://localhost",
  user: process.env.NEO4J_USER || "neo4j",
  password: process.env.NEO4J_PASSWORD || "testtest"
};
