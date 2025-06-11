import { driver } from '@/app/services/neo4j/config';
import { NextRequest, NextResponse } from 'next/server';
import { importSafetyGraphData } from '@/app/services/neo4j/queries/safety'; // Adjust path as needed

interface SafetyGraphData {
  failures: Array<{ uuid: string; properties: Record<string, any> }>;
  causations: Array<{ uuid: string; properties: Record<string, any> }>;
  occurrences: Array<{
    failureUuid: string;
    failureName: string; // Not directly used in import but good for context
    occuranceSourceUuid: string;
    occuranceSourceName: string; // Not directly used in import but good for context
    // other occurrence fields are not directly used in linking but are part of the data structure
  }>;
  causationLinks: Array<{
    causationUuid: string;
    causationName: string; // Not directly used in import but good for context
    causeFailureUuid: string;
    effectFailureUuid: string;
  }>;
}

async function importSafetyData(data: SafetyGraphData): Promise<{ logs: string[]; success: boolean; error?: string }> {
  const logs: string[] = [];
  const session = driver.session();
  let transactionActive = false;

  try {
    logs.push('Starting safety data import process...');
    const tx = session.beginTransaction();
    transactionActive = true;

    // Step 1: Import Failures
    logs.push(`--- Importing ${data.failures.length} Failures ---`);
    for (const failure of data.failures) {
      const existingFailure = await tx.run(
        'MATCH (f:FAILURE {uuid: $uuid}) RETURN f.uuid',
        { uuid: failure.uuid }
      );
      if (existingFailure.records.length > 0) {
        logs.push(`Failure ${failure.properties.name} (UUID: ${failure.uuid}) already exists. Skipping creation, attempting update.`);
        // Update existing failure node properties (excluding uuid)
        const propertiesToUpdate = { ...failure.properties };
        delete propertiesToUpdate.uuid; // Ensure UUID is not part of SET properties
        await tx.run(
          'MATCH (f:FAILURE {uuid: $uuid}) SET f += $props',
          { uuid: failure.uuid, props: propertiesToUpdate }
        );
        logs.push(`  Updated properties for failure ${failure.properties.name}.`);
      } else {
        await tx.run(
          'CREATE (f:FAILURE $props)',
          { props: failure.properties } // uuid is part of properties here
        );
        logs.push(`Created new failure: ${failure.properties.name} (UUID: ${failure.uuid})`);
      }
    }

    // Step 2: Import Causations
    logs.push(`--- Importing ${data.causations.length} Causations ---`);
    for (const causation of data.causations) {
      const existingCausation = await tx.run(
        'MATCH (c:CAUSATION {uuid: $uuid}) RETURN c.uuid',
        { uuid: causation.uuid }
      );
      if (existingCausation.records.length > 0) {
        logs.push(`Causation ${causation.properties.name} (UUID: ${causation.uuid}) already exists. Skipping creation, attempting update.`);
        const propertiesToUpdate = { ...causation.properties };
        delete propertiesToUpdate.uuid;
        await tx.run(
          'MATCH (c:CAUSATION {uuid: $uuid}) SET c += $props',
          { uuid: causation.uuid, props: propertiesToUpdate }
        );
        logs.push(`  Updated properties for causation ${causation.properties.name}.`);
      } else {
        await tx.run(
          'CREATE (c:CAUSATION $props)',
          { props: causation.properties }
        );
        logs.push(`Created new causation: ${causation.properties.name} (UUID: ${causation.uuid})`);
      }
    }

    // Step 3: Link Occurrences
    // Assumes failure nodes are already created/updated from Step 1.
    // Assumes occurrence source nodes (e.g., ARXML elements) must exist.
    logs.push(`--- Linking ${data.occurrences.length} Occurrences ---`);
    for (const occ of data.occurrences) {
      const failureExists = await tx.run('MATCH (f:FAILURE {uuid: $failureUuid}) RETURN f.uuid', { failureUuid: occ.failureUuid });
      if (failureExists.records.length === 0) {
        logs.push(`  [Warning] Occurrence linking skipped: Failure node with UUID ${occ.failureUuid} not found for occurrence target ${occ.occuranceSourceName}.`);
        continue;
      }

      const sourceExists = await tx.run('MATCH (os {uuid: $sourceUuid}) RETURN os.uuid, labels(os) as lbls', { sourceUuid: occ.occuranceSourceUuid });
      if (sourceExists.records.length === 0) {
        logs.push(`  [Error] Occurrence linking failed: Source node ${occ.occuranceSourceName} (UUID: ${occ.occuranceSourceUuid}) not found in database. Cannot link failure ${occ.failureName}.`);
        continue;
      }
      logs.push(`  Source node ${occ.occuranceSourceName} (UUID: ${occ.occuranceSourceUuid}, Labels: ${sourceExists.records[0].get('lbls').join(',')}) found.`);

      // Check if relationship already exists to avoid duplicates
      const relExists = await tx.run(
        'MATCH (f:FAILURE {uuid: $failureUuid})-[r:OCCURRENCE]->(os {uuid: $sourceUuid}) RETURN r',
        { failureUuid: occ.failureUuid, sourceUuid: occ.occuranceSourceUuid }
      );
      if (relExists.records.length > 0) {
        logs.push(`  Occurrence relationship between Failure ${occ.failureName} and Source ${occ.occuranceSourceName} already exists. Skipping.`);
      } else {
        await tx.run(
          'MATCH (f:FAILURE {uuid: $failureUuid}), (os {uuid: $sourceUuid}) CREATE (f)-[:OCCURRENCE]->(os)',
          { failureUuid: occ.failureUuid, sourceUuid: occ.occuranceSourceUuid }
        );
        logs.push(`  Created OCCURRENCE link: Failure ${occ.failureName} -> Source ${occ.occuranceSourceName}`);
      }
    }

    // Step 4: Link Causations (FIRST, THEN relationships)
    // Assumes failure and causation nodes are already created/updated.
    logs.push(`--- Linking ${data.causationLinks.length} Causation Links ---`);
    for (const link of data.causationLinks) {
      const causeFailureExists = await tx.run('MATCH (f:FAILURE {uuid: $uuid}) RETURN f.uuid', { uuid: link.causeFailureUuid });
      const effectFailureExists = await tx.run('MATCH (f:FAILURE {uuid: $uuid}) RETURN f.uuid', { uuid: link.effectFailureUuid });
      const causationNodeExists = await tx.run('MATCH (c:CAUSATION {uuid: $uuid}) RETURN c.uuid', { uuid: link.causationUuid });

      if (causeFailureExists.records.length === 0) {
        logs.push(`  [Warning] Causation linking skipped for ${link.causationName}: Cause Failure (UUID ${link.causeFailureUuid}) not found.`);
        continue;
      }
      if (effectFailureExists.records.length === 0) {
        logs.push(`  [Warning] Causation linking skipped for ${link.causationName}: Effect Failure (UUID ${link.effectFailureUuid}) not found.`);
        continue;
      }
      if (causationNodeExists.records.length === 0) {
        logs.push(`  [Warning] Causation linking skipped for ${link.causationName}: Causation node (UUID ${link.causationUuid}) not found.`);
        continue;
      }

      // Link FIRST (Causation to Cause Failure)
      const firstRelExists = await tx.run(
        'MATCH (c:CAUSATION {uuid: $causationUuid})-[r:FIRST]->(f:FAILURE {uuid: $causeFailureUuid}) RETURN r',
        { causationUuid: link.causationUuid, causeFailureUuid: link.causeFailureUuid }
      );
      if (firstRelExists.records.length > 0) {
        logs.push(`  FIRST relationship for ${link.causationName} to ${link.causeFailureName} already exists. Skipping.`);
      } else {
        await tx.run(
          'MATCH (c:CAUSATION {uuid: $causationUuid}), (f:FAILURE {uuid: $causeFailureUuid}) CREATE (c)-[:FIRST]->(f)',
          { causationUuid: link.causationUuid, causeFailureUuid: link.causeFailureUuid }
        );
        logs.push(`  Created FIRST link: Causation ${link.causationName} -> Failure ${link.causeFailureName}`);
      }

      // Link THEN (Causation to Effect Failure)
      const thenRelExists = await tx.run(
        'MATCH (c:CAUSATION {uuid: $causationUuid})-[r:THEN]->(f:FAILURE {uuid: $effectFailureUuid}) RETURN r',
        { causationUuid: link.causationUuid, effectFailureUuid: link.effectFailureUuid }
      );
      if (thenRelExists.records.length > 0) {
        logs.push(`  THEN relationship for ${link.causationName} to ${link.effectFailureName} already exists. Skipping.`);
      } else {
        await tx.run(
          'MATCH (c:CAUSATION {uuid: $causationUuid}), (f:FAILURE {uuid: $effectFailureUuid}) CREATE (c)-[:THEN]->(f)',
          { causationUuid: link.causationUuid, effectFailureUuid: link.effectFailureUuid }
        );
        logs.push(`  Created THEN link: Causation ${link.causationName} -> Failure ${link.effectFailureName}`);
      }
    }

    await tx.commit();
    transactionActive = false;
    logs.push('--- Import process completed successfully. Transaction committed. ---');
    return { logs, success: true };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during import';
    logs.push(`--- Import failed: ${errorMessage} ---`);
    console.error('Neo4j Import Error:', error);
    if (transactionActive) {
      try {
        await session.lastBookmark() // Ensure bookmark is available if needed for rollback
        await tx.rollback();
        logs.push('Transaction rolled back due to error.');
      } catch (rollbackError) {
        const rbErrorMsg = rollbackError instanceof Error ? rollbackError.message : 'Unknown rollback error';
        logs.push(`Failed to rollback transaction: ${rbErrorMsg}`);
        console.error('Rollback Error:', rollbackError);
      }
    }
    return { logs, success: false, error: errorMessage };
  } finally {
    await session.close();
    logs.push('Session closed.');
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json() as SafetyGraphData;
    
    // Basic validation of incoming data structure
    if (!data || !data.failures || !data.causations || !data.occurrences || !data.causationLinks) {
      return NextResponse.json(
        { message: 'Invalid request body. Missing required safety graph data fields.', logs: ['Validation failed: Missing fields'] }, 
        { status: 400 }
      );
    }

    const result = await importSafetyGraphData(data);

    if (result.success) {
      return NextResponse.json({ success: true, logs: result.logs, message: 'Data imported successfully.' });
    } else {
      return NextResponse.json({ success: false, logs: result.logs, message: result.message || 'Failed to import data.' }, { status: 500 });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error processing request';
    console.error('[API safety-graph/import] Error:', error);
    return NextResponse.json({ success: false, message: `Internal server error: ${errorMessage}` }, { status: 500 });
  }
}
