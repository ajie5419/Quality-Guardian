import type { Prisma } from '@prisma/client';

import prisma from '~/utils/prisma';

export type ProcessResponsibilityType = 'OUTSOURCING_UNIT' | 'SUPPLIER';

/**
 * One process -> responsible department assignment. The department is
 * addressed by its name path (root to target, e.g. ['科技公司', '制造 SOBU',
 * '采购部']) so the script never hard-codes environment-specific IDs; the
 * path is resolved against the live department tree and any ambiguity
 * (missing or duplicate name at a level) is reported instead of guessed.
 */
export interface ProcessDepartmentAssignment {
  /** processes.name */
  processName: string;
  /** Expected responsibility type of the process (used for a warning only). */
  responsibilityType: ProcessResponsibilityType;
  /** Department name path from the tree root. */
  departmentPath: string[];
}

export interface DepartmentIdentity {
  id: string;
  name: string;
}

export type BackfillEntry =
  | {
      action: 'planned' | 'skipped' | 'updated';
      departmentId: string;
      processName: string;
      supplierSourceMismatch?: boolean;
    }
  | {
      action: 'unresolved';
      candidates?: DepartmentIdentity[];
      processName: string;
      reason:
        | 'AMBIGUOUS_DEPARTMENT_PATH'
        | 'DEPARTMENT_NOT_FOUND'
        | 'PROCESS_NOT_FOUND';
    };

export interface BackfillSummary {
  entries: BackfillEntry[];
  planned: number;
  skipped: number;
  unresolved: number;
  updated: number;
}

interface DepartmentRow {
  id: string;
  name: string;
  parentId: string;
}

interface DepartmentNode extends DepartmentRow {
  children: DepartmentNode[];
}

function buildDepartmentTree(rows: DepartmentRow[]): DepartmentNode[] {
  const nodes = new Map<string, DepartmentNode>();
  for (const row of rows) {
    nodes.set(row.id, { ...row, children: [] });
  }
  const roots: DepartmentNode[] = [];
  for (const node of nodes.values()) {
    const parent = nodes.get(node.parentId);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function resolveDepartmentByPath(
  roots: DepartmentNode[],
  path: string[],
): {
  candidates?: DepartmentIdentity[];
  department: DepartmentIdentity | null;
} {
  let level: DepartmentNode[] = roots;
  for (const [index, name] of path.entries()) {
    const matches = level.filter((node) => node.name === name);
    if (matches.length === 0) {
      return {
        candidates: level.map((node) => ({ id: node.id, name: node.name })),
        department: null,
      };
    }
    if (matches.length > 1) {
      return {
        candidates: matches.map((node) => ({ id: node.id, name: node.name })),
        department: null,
      };
    }
    const matched = matches[0] as DepartmentNode;
    if (index === path.length - 1) {
      return { department: { id: matched.id, name: matched.name } };
    }
    level = matched.children;
  }
  return { department: null };
}

export async function runProcessResponsibleDepartmentBackfill(options: {
  assignments: ProcessDepartmentAssignment[];
  client?: Prisma.TransactionClient;
  mode: 'apply' | 'dry-run';
}): Promise<BackfillSummary> {
  const client = options.client ?? prisma;
  const rows = await client.departments.findMany({
    select: { id: true, name: true, parentId: true },
    where: { isDeleted: false },
  });
  const roots = buildDepartmentTree(rows as DepartmentRow[]);
  const entries: BackfillEntry[] = [];

  for (const assignment of options.assignments) {
    const process = await client.processes.findFirst({
      select: {
        id: true,
        name: true,
        responsibleDepartmentId: true,
        supplierSource: true,
      },
      where: { isDeleted: false, name: assignment.processName },
    });
    if (!process) {
      entries.push({
        action: 'unresolved',
        processName: assignment.processName,
        reason: 'PROCESS_NOT_FOUND',
      });
      continue;
    }
    const { candidates, department } = resolveDepartmentByPath(
      roots,
      assignment.departmentPath,
    );
    if (!department) {
      entries.push({
        action: 'unresolved',
        candidates,
        processName: assignment.processName,
        reason:
          candidates && candidates.length > 1
            ? 'AMBIGUOUS_DEPARTMENT_PATH'
            : 'DEPARTMENT_NOT_FOUND',
      });
      continue;
    }
    const supplierSourceMismatch =
      assignment.responsibilityType === 'OUTSOURCING_UNIT'
        ? process.supplierSource !== 'Outsourcing'
        : process.supplierSource !== 'Supplier';
    if (process.responsibleDepartmentId === department.id) {
      entries.push({
        action: 'skipped',
        departmentId: department.id,
        processName: assignment.processName,
        supplierSourceMismatch,
      });
      continue;
    }
    entries.push({
      action: options.mode === 'apply' ? 'updated' : 'planned',
      departmentId: department.id,
      processName: assignment.processName,
      supplierSourceMismatch,
    });
    if (options.mode === 'apply') {
      await client.processes.update({
        data: { responsibleDepartmentId: department.id },
        where: { id: process.id },
      });
    }
  }

  return {
    entries,
    planned: entries.filter((entry) => entry.action === 'planned').length,
    skipped: entries.filter((entry) => entry.action === 'skipped').length,
    unresolved: entries.filter((entry) => entry.action === 'unresolved').length,
    updated: entries.filter((entry) => entry.action === 'updated').length,
  };
}

/**
 * Default assignments following the agreed business rules:
 *   - 外购件 / 原材料 -> supplier responsibility -> 采购部 (制造 SOBU)
 *   - 机加成品件-外协 / 辅材 -> outsourcing responsibility -> 生产履约部
 * Department paths must match the target database department tree; adjust
 * them per deployment before running with --apply.
 */
export const DEFAULT_PROCESS_DEPARTMENT_ASSIGNMENTS: ProcessDepartmentAssignment[] =
  [
    {
      departmentPath: ['科技公司', '制造 SOBU', '采购部'],
      processName: '外购件',
      responsibilityType: 'SUPPLIER',
    },
    {
      departmentPath: ['科技公司', '制造 SOBU', '采购部'],
      processName: '原材料',
      responsibilityType: 'SUPPLIER',
    },
    {
      departmentPath: ['生产履约部'],
      processName: '机加成品件-外协',
      responsibilityType: 'OUTSOURCING_UNIT',
    },
    {
      departmentPath: ['生产履约部'],
      processName: '辅材',
      responsibilityType: 'OUTSOURCING_UNIT',
    },
  ];
