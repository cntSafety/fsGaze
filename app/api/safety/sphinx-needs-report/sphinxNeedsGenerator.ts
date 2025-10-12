import type { ComponentSafetyData } from '@/app/services/neo4j/queries/safety/exportSWCSafety';

type ComponentSummary = {
  name: string;
  uuid: string;
  arxmlPath?: string | null;
  componentType?: string | null;
};

type ComponentSafetyRecord = ComponentSafetyData & {
  componentUuid?: string | null;
  componentName?: string | null;
  fmAsil?: string | null;
  reqName?: string | null;
  reqASIL?: string | null;
  reqID?: string | null;
  reqLinkedTo?: string | null;
  reqText?: string | null;
  riskRatingName?: string | null;
  fmTask?: string | null;
  fmNote?: string | null;
  RatingComment?: string | null;
  RiskScore?: number | null;
  RiskRatingTaskName?: string | null;
  RiskRatingTaskDescription?: string | null;
  RiskRatingTaskResponsible?: string | null;
  RiskRatingTaskStatus?: string | null;
};

type PortSafetyRecord = {
  componentUuid?: string | null;
  componentName?: string | null;
  portUuid?: string | null;
  PortName?: string | null;
  portType?: string | null;
  fmUuid?: string | null;
  fmName?: string | null;
  fmDescription?: string | null;
  fmAsil?: string | null;
  reqName?: string | null;
  reqASIL?: string | null;
  reqID?: string | null;
  reqLinkedTo?: string | null;
  reqText?: string | null;
  RatingComment?: string | null;
  Severity?: number | null;
  Occurrence?: number | null;
  Detection?: number | null;
};

type RequirementInfo = {
  name?: string | null;
  asil?: string | null;
  id?: string | null;
  linkedTo?: string | null;
  text?: string | null;
};

type RiskRatingInfo = {
  name?: string | null;
  comment?: string | null;
  severity?: number | null;
  occurrence?: number | null;
  detection?: number | null;
};

type FailureMode = {
  name: string;
  uuid?: string | null;
  description?: string | null;
  asil?: string | null;
  requirements: RequirementInfo[];
  risk: RiskRatingInfo | undefined;
};

type PortFailureMode = FailureMode & {
  uuid?: string | null;
  portName?: string | null;
};

type RawCausationRecord = {
  causesFMUUID: string;
  effectsFMUUID: string;
};

type FailureModeAssignment = {
  fm: FailureMode;
  id: string;
};

type PortFailureModeAssignment = {
  fm: PortFailureMode;
  id: string;
};

type ComponentAssignments = {
  functional: FailureModeAssignment[];
  receiver: PortFailureModeAssignment[];
  provider: PortFailureModeAssignment[];
};

type AggregatedComponent = {
  component: ComponentSummary;
  safetyNotes: string[];
  failureModes: FailureMode[];
  receiverPortFailureModes: PortFailureMode[];
  providerPortFailureModes: PortFailureMode[];
};

type AggregatedMap = Map<string, AggregatedComponent>;

type GenerateRstInput = {
  components: ComponentSummary[];
  componentSafety: ComponentSafetyRecord[];
  portSafety: PortSafetyRecord[];
  causations?: RawCausationRecord[];
};

type GeneratedRstFile = {
  componentUuid: string;
  fileName: string;
  content: string;
};

const normalizeIdBase = (name: string): string => {
  const stripped = name.replace(/[^a-zA-Z0-9]/g, '');
  return stripped.length > 0 ? stripped.toUpperCase() : 'COMPONENT';
};

const formatMultiline = (value?: string | null): string => {
  if (!value) {
    return '';
  }
  return value.replace(/\r\n?/g, '\n');
};

const renderDirectiveField = (label: string, content: string): string[] => {
  const baseIndent = '   ';
  const continuationIndent = '     ';
  const normalized = formatMultiline(content).split('\n');
  const [firstLine, ...rest] = normalized;
  const lines: string[] = [];

  if (firstLine && firstLine.trim().length > 0) {
    lines.push(`${baseIndent}**${label}:**  ${firstLine}`.trimEnd());
  } else {
    lines.push(`${baseIndent}**${label}:**`.trimEnd());
  }

  rest.forEach(line => {
    lines.push(`${continuationIndent}${line}`.trimEnd());
  });

  return lines;
};

const formatRequirement = (req: RequirementInfo): string => {
  const parts: string[] = [];
  if (req.name) {
    parts.push(`Requirement Name: ${req.name}`);
  }
  if (req.asil) {
    parts.push(req.asil);
  }
  if (req.id) {
    parts.push(`Requirement ID: ${req.id}`);
  }
  if (req.linkedTo) {
    parts.push(`Requirement Link ${req.linkedTo}`);
  }
  if (req.text) {
    parts.push(`Requirement text: ${formatMultiline(req.text)}`);
  }
  return parts.length > 0 ? parts.join(', ') : 'No linked safety requirement.';
};

const formatRisk = (risk?: RiskRatingInfo): string | undefined => {
  if (!risk) {
    return undefined;
  }

  const comment = formatMultiline(risk.comment);
  const hasComment = comment.trim().length > 0;
  const severity = risk.severity ?? undefined;
  const occurrence = risk.occurrence ?? undefined;
  const detection = risk.detection ?? undefined;
  const hasMetrics = [severity, occurrence, detection].some(value => value !== undefined && value !== null);

  if (!hasComment && !hasMetrics) {
    return undefined;
  }

  const lines: string[] = [];
  if (hasComment) {
    lines.push(comment);
  } else if (hasMetrics) {
    lines.push('No risk rating comment provided.');
  }

  if (hasMetrics) {
    lines.push(`S: ${severity ?? '-'}, O: ${occurrence ?? '-'}, D: ${detection ?? '-'}`);
  }

  return lines.join('\n');
};

const uniquePush = <T>(array: T[], value: T, keySelector: (item: T) => string): void => {
  const key = keySelector(value);
  if (!array.some(item => keySelector(item) === key)) {
    array.push(value);
  }
};

const buildCausationMap = (records: RawCausationRecord[]): Map<string, Set<string>> => {
  const map = new Map<string, Set<string>>();
  records.forEach(record => {
    const causeUuid = record.causesFMUUID;
    const effectUuid = record.effectsFMUUID;

    if (!causeUuid || !effectUuid) {
      return;
    }

    const existing = map.get(effectUuid) ?? new Set<string>();
    existing.add(causeUuid);
    map.set(effectUuid, existing);
  });
  return map;
};

const createAssignmentsForComponent = (
  aggregated: AggregatedComponent,
  failureModeIdMap: Map<string, string>,
): ComponentAssignments => {
  const idBase = normalizeIdBase(aggregated.component.name);

  const functional = aggregated.failureModes.map((fm, index) => {
    const counter = String(index + 1).padStart(3, '0');
    const id = `${idBase}_FM_${counter}`;
    if (fm.uuid) {
      failureModeIdMap.set(fm.uuid, id);
    }
    return { fm, id };
  });

  const receiver = aggregated.receiverPortFailureModes.map((fm, index) => {
    const counter = String(index + 1).padStart(3, '0');
    const id = `${idBase}_FM_RP_${counter}`;
    if (fm.uuid) {
      failureModeIdMap.set(fm.uuid, id);
    }
    return { fm, id };
  });

  const provider = aggregated.providerPortFailureModes.map((fm, index) => {
    const counter = String(index + 1).padStart(3, '0');
    const id = `${idBase}_FM_PP_${counter}`;
    if (fm.uuid) {
      failureModeIdMap.set(fm.uuid, id);
    }
    return { fm, id };
  });

  return { functional, receiver, provider };
};

const getOrCreateAggregatedComponent = (
  map: AggregatedMap,
  component: ComponentSummary,
): AggregatedComponent => {
  let existing = map.get(component.uuid);
  if (!existing) {
    existing = {
      component,
      safetyNotes: [],
      failureModes: [],
      receiverPortFailureModes: [],
      providerPortFailureModes: [],
    };
    map.set(component.uuid, existing);
  }
  return existing;
};

const aggregateComponentSafety = (
  aggregatedMap: AggregatedMap,
  componentsLookup: Map<string, ComponentSummary>,
  componentSafety: ComponentSafetyRecord[],
): void => {
  const fmCache: Map<string, Map<string, FailureMode>> = new Map();

  componentSafety.forEach(record => {
    const uuid = record.componentUuid ?? '';
    const componentInfo = componentsLookup.get(uuid) ?? componentsLookup.get(record.componentName ?? '') ?? null;
    if (!componentInfo) {
      return;
    }

    const agg = getOrCreateAggregatedComponent(aggregatedMap, componentInfo);

    if (record.safetyNote) {
      const noteText = formatMultiline(record.safetyNote).trim();
      if (noteText && !agg.safetyNotes.includes(noteText)) {
        agg.safetyNotes.push(noteText);
      }
    }

    if (!record.fmName && !record.fmDescription) {
      return;
    }

    const componentCache = fmCache.get(componentInfo.uuid) ?? new Map<string, FailureMode>();
    if (!fmCache.has(componentInfo.uuid)) {
      fmCache.set(componentInfo.uuid, componentCache);
    }

    const fmKey = `${record.fmName ?? 'Unnamed FM'}||${record.fmDescription ?? ''}`;
    let fm = componentCache.get(fmKey);
    if (!fm) {
      fm = {
        name: record.fmName ?? 'Unnamed Failure Mode',
        uuid: record.fmUuid,
        description: record.fmDescription,
        asil: record.fmAsil,
        requirements: [],
        risk: undefined,
      };
      componentCache.set(fmKey, fm);
      agg.failureModes.push(fm);
    }

    if (record.reqName || record.reqASIL || record.reqID || record.reqLinkedTo || record.reqText) {
      uniquePush(fm.requirements, {
        name: record.reqName,
        asil: record.reqASIL,
        id: record.reqID,
        linkedTo: record.reqLinkedTo,
        text: record.reqText,
      }, item => [item.name, item.id, item.linkedTo, item.text].join('|'));
    }

    if (!fm.risk && (record.RatingComment || record.Severity !== null || record.Occurrence !== null || record.Detection !== null)) {
      fm.risk = {
        name: record.riskRatingName,
        comment: record.RatingComment,
        severity: record.Severity ?? null,
        occurrence: record.Occurrence ?? null,
        detection: record.Detection ?? null,
      };
    }
  });
};

const aggregatePortSafety = (
  aggregatedMap: AggregatedMap,
  componentsLookup: Map<string, ComponentSummary>,
  portSafety: PortSafetyRecord[],
): void => {
  const portCache: Map<string, Map<string, PortFailureMode>> = new Map();

  portSafety.forEach(record => {
    const uuid = record.componentUuid ?? '';
    const componentInfo = componentsLookup.get(uuid) ?? componentsLookup.get(record.componentName ?? '') ?? null;
    if (!componentInfo) {
      return;
    }

    const agg = getOrCreateAggregatedComponent(aggregatedMap, componentInfo);
    const cache = portCache.get(componentInfo.uuid) ?? new Map<string, PortFailureMode>();
    if (!portCache.has(componentInfo.uuid)) {
      portCache.set(componentInfo.uuid, cache);
    }

    if (!record.fmName && !record.fmDescription) {
      return;
    }

    const portType = record.portType ?? '';
    const fmKey = `${record.portUuid ?? record.PortName ?? 'unknown'}||${record.fmName ?? 'Unnamed FM'}||${record.fmDescription ?? ''}`;
    let fm = cache.get(fmKey);
    if (!fm) {
      fm = {
        name: record.fmName ?? 'Unnamed Failure Mode',
        uuid: record.fmUuid,
        description: record.fmDescription,
        asil: record.fmAsil,
        requirements: [],
        risk: {
          comment: record.RatingComment,
          severity: record.Severity ?? null,
          occurrence: record.Occurrence ?? null,
          detection: record.Detection ?? null,
        },
        portName: record.PortName,
      };
      cache.set(fmKey, fm);

      if (portType === 'R_PORT_PROTOTYPE') {
        agg.receiverPortFailureModes.push(fm);
      } else {
        agg.providerPortFailureModes.push(fm);
      }
    }

    if (record.reqName || record.reqASIL || record.reqID || record.reqLinkedTo || record.reqText) {
      uniquePush(fm.requirements, {
        name: record.reqName,
        asil: record.reqASIL,
        id: record.reqID,
        linkedTo: record.reqLinkedTo,
        text: record.reqText,
      }, item => [item.name, item.id, item.linkedTo, item.text].join('|'));
    }
  });
};

const repeatChar = (char: string, length: number): string => char.repeat(Math.max(0, length));

const renderSafetyNotes = (idBase: string, notes: string[]): string => {
  if (notes.length === 0) {
    return '.. note::\n   No safety notes recorded for this component.\n';
  }

  return notes
    .map((note, index) => {
      const counter = String(index + 1).padStart(2, '0');
      const id = `${idBase}_SN_${counter}`;
  return [`.. safetynote:: Safety Note`, `   :id: ${id}`, '', `   ${note.replace(/\n/g, '\n   ')}`, ''].join('\n');
    })
    .join('\n\n');
};

const renderFunctionalFailureModes = (
  assignments: FailureModeAssignment[],
  causationMap: Map<string, Set<string>>,
  failureModeIdMap: Map<string, string>,
): string => {
  if (assignments.length === 0) {
    return '.. note::\n   No functional failure modes recorded for this component.\n';
  }

  return assignments
    .map(({ fm, id }) => {
      const asilLine = fm.asil ? `   :asil: ${fm.asil}` : undefined;
      const causeUuidSet = fm.uuid ? causationMap.get(fm.uuid) : undefined;
      const causeIds = causeUuidSet
        ? Array.from(causeUuidSet)
            .map(uuid => failureModeIdMap.get(uuid))
            .filter((value): value is string => Boolean(value))
        : [];
    const requirement = formatRequirement(fm.requirements[0] ?? {});
    const riskLine = formatRisk(fm.risk);

      const lines = [`.. fm:: ${fm.name}`, `   :id: ${id}`];
      if (asilLine) {
        lines.push(asilLine);
      }
      if (causeIds.length > 0) {
        lines.push(`   :causation: ${causeIds.join(', ')}`);
      }
      const description = fm.description ? formatMultiline(fm.description) : 'No description provided.';
      lines.push('');
      lines.push(...renderDirectiveField('Description', description));
      lines.push('');
      lines.push(...renderDirectiveField('Related requirement', requirement));
      if (riskLine) {
        lines.push('');
        lines.push(...renderDirectiveField('Risk Rating', riskLine));
      }
      lines.push('');
      return lines.join('\n');
    })
    .join('\n\n');
};

const renderPortFailureModes = (
  assignments: PortFailureModeAssignment[],
  causationMap: Map<string, Set<string>>,
  failureModeIdMap: Map<string, string>,
): string => {
  if (assignments.length === 0) {
    return '.. note::\n   No failure modes recorded for these ports.\n';
  }

  return assignments
    .map(({ fm, id }) => {
      const asilLine = fm.asil ? `   :asil: ${fm.asil}` : undefined;
      const portLine = fm.portName ? `   :port: ${fm.portName}` : undefined;
      const causeUuidSet = fm.uuid ? causationMap.get(fm.uuid) : undefined;
      const causeIds = causeUuidSet
        ? Array.from(causeUuidSet)
            .map(uuid => failureModeIdMap.get(uuid))
            .filter((value): value is string => Boolean(value))
        : [];
    const requirement = fm.requirements.length > 0 ? formatRequirement(fm.requirements[0]) : undefined;
    const riskLine = fm.risk ? formatRisk(fm.risk) : undefined;

      const lines = [`.. fm:: ${fm.name}`, `   :id: ${id}`];
      if (asilLine) {
        lines.push(asilLine);
      }
      if (portLine) {
        lines.push(portLine);
      }
      if (causeIds.length > 0) {
        lines.push(`   :causation: ${causeIds.join(', ')}`);
      }
      const description = fm.description ? formatMultiline(fm.description) : 'No description provided.';
      lines.push('');
      lines.push(...renderDirectiveField('Description', description));
      if (requirement) {
        lines.push('');
        lines.push(...renderDirectiveField('Related requirement', requirement));
      }
      if (riskLine) {
        lines.push('');
        lines.push(...renderDirectiveField('Risk Rating', riskLine));
      }
      lines.push('');
      return lines.join('\n');
    })
    .join('\n\n');
};

const buildRstContent = (
  aggregated: AggregatedComponent,
  assignments: ComponentAssignments,
  causationMap: Map<string, Set<string>>,
  failureModeIdMap: Map<string, string>,
): string => {
  const { component } = aggregated;
  const idBase = normalizeIdBase(component.name);
  const titleUnderline = repeatChar('=', component.name.length);

  const lines: string[] = [];
  lines.push(component.name);
  lines.push(titleUnderline);
  lines.push('');

  lines.push('Component ID and Type');
  lines.push('----------------------');
  lines.push('');
  lines.push(`.. csv-table:: ${component.name}`);
  lines.push('   :header: "Information", "Value"');
  lines.push('   :widths: auto');
  lines.push('');
  lines.push(`   "UUID", ${component.uuid}`);
  lines.push(`   "Component Type", ${component.componentType ?? 'Unknown'}`);
  if (component.arxmlPath) {
    lines.push(`   "ARXML Path", ${component.arxmlPath}`);
  }
  lines.push('');
  lines.push('');

  lines.push('Safety Information');
  lines.push('------------------');
  lines.push('');
  lines.push(renderSafetyNotes(idBase, aggregated.safetyNotes));
  lines.push('');

  lines.push('Functional Failure Modes');
  lines.push('-------------------------');
  lines.push('');
  lines.push(renderFunctionalFailureModes(assignments.functional, causationMap, failureModeIdMap));
  lines.push('');

  lines.push('Receiver Ports Failure Modes');
  lines.push('-----------------------------');
  lines.push('');
  lines.push(renderPortFailureModes(assignments.receiver, causationMap, failureModeIdMap));
  lines.push('');

  lines.push('Provider Ports Failure Modes');
  lines.push('-----------------------------');
  lines.push('');
  lines.push(renderPortFailureModes(assignments.provider, causationMap, failureModeIdMap));
  lines.push('');

  return lines.join('\n');
};

export const generateSphinxNeedsRstFiles = ({
  components,
  componentSafety,
  portSafety,
  causations = [],
}: GenerateRstInput): GeneratedRstFile[] => {
  const componentsLookup = new Map<string, ComponentSummary>();
  components.forEach(component => {
    componentsLookup.set(component.uuid, component);
    componentsLookup.set(component.name, component);
  });

  const aggregatedMap: AggregatedMap = new Map();

  components.forEach(component => {
    getOrCreateAggregatedComponent(aggregatedMap, component);
  });

  aggregateComponentSafety(aggregatedMap, componentsLookup, componentSafety);
  aggregatePortSafety(aggregatedMap, componentsLookup, portSafety);
  const failureModeIdMap = new Map<string, string>();
  const causationMap = buildCausationMap(causations);

  const entries = Array.from(aggregatedMap.values());
  const assignmentsMap = new Map<string, ComponentAssignments>();

  entries.forEach(entry => {
    const assignments = createAssignmentsForComponent(entry, failureModeIdMap);
    assignmentsMap.set(entry.component.uuid, assignments);
  });

  return entries.map(entry => {
    const assignments = assignmentsMap.get(entry.component.uuid);
    const safeAssignments = assignments ?? createAssignmentsForComponent(entry, failureModeIdMap);
    return {
      componentUuid: entry.component.uuid,
      fileName: `${entry.component.name.replace(/[^a-zA-Z0-9-_]/g, '_') || 'component'}.rst`,
      content: buildRstContent(entry, safeAssignments, causationMap, failureModeIdMap),
    };
  });
};

export type { GeneratedRstFile };