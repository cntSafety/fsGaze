import { NextRequest, NextResponse } from 'next/server';
import { getAllComponentSafetyData, getAllPortSafetyData } from '@/app/services/neo4j/queries/safety/exportSWCSafety';
import { getApplicationSwComponents } from '@/app/services/neo4j/queries/components';

export async function GET(request: NextRequest) {
  const dataset = request.nextUrl.searchParams.get('dataset') ?? 'functional';

  try {
    if (dataset === 'functional') {
      const result = await getAllComponentSafetyData();

      if (!result.success || !result.data) {
        return NextResponse.json(
          {
            success: false,
            message: result.message ?? 'Failed to load component safety analysis data.',
          },
          { status: 500 }
        );
      }

      const uniqueComponents = new Set(
        result.data
          .map(item => item.componentUuid ?? item.componentName)
          .filter(Boolean)
      );

      return NextResponse.json({
        success: true,
        data: result.data,
        metadata: {
          totalRecords: result.data.length,
          totalComponents: uniqueComponents.size,
        },
      });
    }

    if (dataset === 'ports') {
      const [portResult, componentsResult] = await Promise.all([
        getAllPortSafetyData(),
        getApplicationSwComponents(),
      ]);

      if (!portResult.success || !portResult.data) {
        return NextResponse.json(
          {
            success: false,
            message: portResult.message ?? 'Failed to load port safety analysis data.',
          },
          { status: 500 }
        );
      }

      if (!componentsResult.success || !componentsResult.data) {
        return NextResponse.json(
          {
            success: false,
            message: componentsResult.message ?? 'Failed to load SW components.',
          },
          { status: 500 }
        );
      }

      const uniqueComponents = new Set(
        portResult.data
          .map(item => item.componentUuid ?? item.componentName)
          .filter(Boolean)
      );

      return NextResponse.json({
        success: true,
        data: portResult.data,
        components: componentsResult.data,
        metadata: {
          totalRecords: portResult.data.length,
          totalComponents: uniqueComponents.size,
        },
      });
    }

    return NextResponse.json(
      {
        success: false,
        message: `Unsupported dataset "${dataset}" requested.`,
      },
      { status: 400 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        success: false,
        message: `Error while loading safety analysis dataset: ${message}`,
      },
      { status: 500 }
    );
  }
}
