import { NextRequest, NextResponse } from 'next/server';
import { getAllComponentSafetyData, getAllPortSafetyData } from '@/app/services/neo4j/queries/safety/exportSWCSafety';
import { getApplicationSwComponents } from '@/app/services/neo4j/queries/components';
import { getDataElementDetailsForPort } from '@/app/services/neo4j/queries/ports';

const ASIL_RANK: Record<string, number> = {
  QM: 0,
  A: 1,
  B: 2,
  C: 3,
  D: 4,
};

const normalizeAsil = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  const trimmed = value.toString().trim().toUpperCase();
  if (!trimmed) {
    return null;
  }

  const withoutPrefix = trimmed.startsWith('ASIL-') ? trimmed.split('-').pop() : trimmed;
  if (!withoutPrefix) {
    return null;
  }

  return withoutPrefix;
};

const getMaxAsil = (asilValues: Array<string | null | undefined>): string | null => {
  let maxRank = -1;
  let maxValue: string | null = null;

  asilValues.forEach(value => {
    const normalized = normalizeAsil(value);
    if (!normalized) {
      return;
    }

    const rank = ASIL_RANK[normalized] ?? -1;
    if (rank > maxRank) {
      maxRank = rank;
      maxValue = normalized;
    }
  });

  return maxValue;
};

const toTypeString = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    return value
      .map(entry => (entry === null || entry === undefined ? '' : String(entry)))
      .filter(entry => entry.length > 0)
      .join(' | ') || null;
  }

  const stringValue = String(value).trim();
  return stringValue.length === 0 ? null : stringValue;
};

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

    if (dataset === 'ports-data-elements') {
      const portResult = await getAllPortSafetyData();

      if (!portResult.success || !portResult.data) {
        return NextResponse.json(
          {
            success: false,
            message: portResult.message ?? 'Failed to load port safety analysis data.',
          },
          { status: 500 }
        );
      }

      const portBaseData = new Map<
        string,
        {
          componentName: string | null;
          componentType: string | null;
          portName: string | null;
          portType: string | null;
          asilValues: Array<string | null | undefined>;
        }
      >();

      portResult.data.forEach(item => {
        const portUuid: string | null | undefined = item.portUuid;
        if (!portUuid) {
          return;
        }

        const existing = portBaseData.get(portUuid);
        if (existing) {
          existing.asilValues.push(item.fmAsil ?? null);
          const newComponentType = toTypeString(item.componentType);
          if (!existing.componentType && newComponentType) {
            existing.componentType = newComponentType;
          }
          const newPortType = toTypeString(item.portType);
          if (!existing.portType && newPortType) {
            existing.portType = newPortType;
          }
          return;
        }

        portBaseData.set(portUuid, {
          componentName: item.componentName ?? null,
          componentType: toTypeString(item.componentType),
          portName: item.PortName ?? null,
          portType: toTypeString(item.portType),
          asilValues: [item.fmAsil ?? null],
        });
      });

      const enrichedData = await Promise.all(
        Array.from(portBaseData.entries()).map(async ([portUuid, info]) => {
          try {
            const dataElementResult = await getDataElementDetailsForPort(portUuid);
            const dataElements = dataElementResult.success && Array.isArray(dataElementResult.data)
              ? dataElementResult.data
                  .map(element => element.dataElementName)
                  .filter((name): name is string => Boolean(name))
              : [];

            return {
              portUuid,
              componentName: info.componentName ?? '',
              componentType: info.componentType ?? '',
              portName: info.portName ?? '',
              portType: info.portType ?? '',
              maxAsil: getMaxAsil(info.asilValues),
              dataElements,
            };
          } catch (error) {
            console.error(`Failed to load data elements for port ${portUuid}:`, error);
            return {
              portUuid,
              componentName: info.componentName ?? '',
              componentType: info.componentType ?? '',
              portName: info.portName ?? '',
              portType: info.portType ?? '',
              maxAsil: getMaxAsil(info.asilValues),
              dataElements: [],
            };
          }
        })
      );

      return NextResponse.json({
        success: true,
        data: enrichedData,
        metadata: {
          totalPorts: enrichedData.length,
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
