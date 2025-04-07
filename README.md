# fsGaze - Functional Safety Visualization and Automation based on SysML-v2

fsGaze is a Proof of Concept\* platform that demonstrates modelling tool-independent safety visualization and automated safety checks. By leveraging a graph database architecture, it provides a flexible foundation for implementing and extending safety verification capabilities.

Project status: EARLY CONCEPT PHASE - do NOT use for production!

![fsGaze Usage Overview](/img/sGazeUsage.png)

## Prerequisites

Before you start, make sure you have the following installed:

- [Node.js](https://nodejs.org/) (v18 or later)
- [npm](https://www.npmjs.com/) (usually comes with Node.js)
- [Docker](https://www.docker.com/get-started/) for running Neo4j

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/cntSafety/fsGaze.git
   cd fsGaze
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Setting up the Database

fsGaze uses Neo4j as its graph database. Run it using Docker:

```bash
docker run -p7474:7474 -p7687:7687 -d --env NEO4J_AUTH=neo4j/testtest neo4j:latest
```

Verify that Neo4j is running by accessing the Neo4j Browser at:
http://localhost:7474/browser/

Use the following credentials in the neo4j UI:

- Username: `neo4j`
- Password: `testtest`

## Running the Application

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to access fsGaze.

## Using fsGaze

1. **Import Data**: Use either API-based or file-based import to load your safety models.

   - Navigate to the Import section in the application
   - Choose your preferred import method

2. **Explore Safety Views**: Visualize different aspects of your safety models:
   - Causal Chain Graphs
   - Causal Chain Flow Diagrams

3. **Safety Automation**: Utilize automated checks to verify safety properties:
   - Find shared signals for CCA --> also avalable via API see /api-docs
   - Identify inputs with integrity issues (TBD..)
   - Discover decomposition issues (TBD..)
   - Find missing requirement assignments (TBD..)
   - And more...

## Project Structure

- `/app`: Contains the Next.js application pages and routes
- `/demoProject`: SysML-v2 Demo Project (exploration assistent with tiger detection feature)
- `/public`: Static assets

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the Mozilla Public License 2.0 - see the [LICENSE](LICENSE) file for details.
FsGaze uses Neo4j Community Edition as its database, which runs as a separate service. Users will need to install and run Neo4j separately as described in the setup instructions.

\*Do not use fsGaze for safety related product development.
[Contact us](mailto:cntsafety@sarkic.de) for information.
