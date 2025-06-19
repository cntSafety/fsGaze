// Quick test to see what exports are available
import * as safetyExports from './app/services/neo4j/queries/safety/index.ts';
import * as arxmlExports from './app/services/ArxmlToNeoService.ts';

console.log('Safety exports:', Object.keys(safetyExports));
console.log('ArxmlToNeoService exports:', Object.keys(arxmlExports));

// Test specific functions
console.log('getSafetyGraph in safety?', 'getSafetyGraph' in safetyExports);
console.log('importSafetyGraphData in safety?', 'importSafetyGraphData' in safetyExports);
console.log('createFailureModeNode in safety?', 'createFailureModeNode' in safetyExports);
console.log('createFailureModeNode in arxmlService?', 'createFailureModeNode' in arxmlExports);
