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

### Development Mode

Start the development server:

*Note: Development mode builds fast but have slower 🐌 UI performance due to on-demand compilation.*

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to access fsGaze.



### Production Build

For better performance ⚡ in production or testing:

1. **Check for TypeScript errors** :
   ```bash
   npx tsc --noEmit --pretty
   ```

2. **Build the production version**:
   ```bash
   npm run build
   ```

3. **Start the production server**:
   ```bash
   npm start
   ```

## ARXML Import and Safety Analysis Features

fsGaze includes comprehensive support for AUTOSAR ARXML file processing and safety analysis workflows:

### 🔧 **ARXML Import System**

- **Multi-file Import**: Select and import multiple ARXML files simultaneously
- **Folder Scanning**: Recursively scan directories for `.arxml` files
- **Progress Tracking**: Real-time progress indicators during import process
- **Graph Database Integration**: Automatically extracts and stores ARXML structure in Neo4j
- **Relationship Mapping**: Preserves AUTOSAR relationships (components, ports, interfaces, etc.)
- **Import Labeling**: Tag imports with version labels for tracking

**Key ARXML Elements Supported:**
- SW Component Prototypes and Types
- Provider/Receiver Port Prototypes  
- Assembly SW Connectors
- Data Elements and Interfaces
- AUTOSAR Package Structure etc....

### 🛡️ **Safety Analysis Capabilities**

- **Two-Level Analysis**: Component-level and port-level failure mode management
- **ASIL Classification**: Support for ASIL A/B/C/D and QM levels
- **Failure Mode CRUD**: Create, read, update, delete failure modes with validation
- **Advanced Causation Analysis**: Link failure modes with causation relationships
- **Visual Selection System**: Color-coded failure mode selection for causation creation
- **Safety Data Exchange**: Export/import safety analysis data in JSON format

**Safety Analysis Workflow:**
1. Import ARXML files to populate component structure
2. Navigate to Safety Analysis section
3. Define failure modes for SW components and ports
4. Create causation relationships between failure modes
5. Export safety analysis 

### 📊 **Graph Database Queries**

The system supports complex Cypher queries for:
- Component relationship analysis
- Signal flow tracing
- Safety requirement verification
- Causal chain analysis
- Shared signal detection

Access the interactive API documentation at `/api-docs` for detailed query examples and API endpoints.

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

## AUTOSAR Acknowledgment

This project processes AUTOSAR ARXML files. AUTOSAR® is a registered trademark of AUTOSAR GbR. This project is not affiliated with or endorsed by AUTOSAR GbR. The AUTOSAR standard and specifications are developed and maintained by AUTOSAR GbR.

For more information about AUTOSAR, visit: https://www.autosar.org/

## Usage restrictions
\*Do NOT use fsGaze for safety related product development. PoC phase !!!
[Contact us](mailto:cntsafety@sarkic.de) for information.
