// DFMEA Project
export interface DfmeaProject {
  id: string;
  projectName: string;
  workOrderId?: string;
  version: string;
  status: 'active' | 'archived' | 'draft';
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

// DFMEA Item
export interface DfmeaItem {
  id: string;
  projectId: string;
  item: string;
  function: string;
  failureMode: string;
  effects: string;
  severity: number;
  occurrence: number;
  detection: number;
  rpn: number;
  order: number;
}

// DFMEA Tree Node
export interface DfmeaTreeNode {
  id: string;
  type: 'item' | 'project';
  parentId?: string;
  name: string;
  projectName?: string;
  failureMode?: string;
  effects?: string;
  severity?: number;
  occurrence?: number;
  detection?: number;
  rpn?: number;
  order?: number;
  // Project stats
  itemCount?: number;
  avgRpn?: number;
  maxRpn?: number;
  riskLevel?: 'high' | 'low' | 'medium';
  // Project info
  version?: string;
  status?: string;
  children?: DfmeaTreeNode[];
}

// DFMEA Project Stats
export interface DfmeaProjectStats {
  projectId: string;
  projectName: string;
  itemCount: number;
  avgRpn: number;
  maxRpn: number;
  highRiskCount: number; // RPN > 100
  mediumRiskCount: number; // 50 < RPN <= 100
  lowRiskCount: number; // RPN <= 50
}

export interface BomProject {
  id: string;
  projectName: string;
  workOrderNumber: string;
  version: string;
  status: 'active' | 'archived' | 'draft';
  description?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface BomItem {
  id: string;
  projectId: string;
  partNumber: string;
  partName: string;
  version: string;
  quantity: number;
  unit: string;
  material: string;
  remarks?: string;
}

export interface BomTreeNode {
  id: string;
  type: 'item' | 'project';
  parentId?: string;
  name: string;
  projectName?: string;
  workOrderNumber?: string;
  version?: string;
  status?: string;
  itemCount?: number;
  children?: BomTreeNode[];
  // Item specific
  partNumber?: string;
  quantity?: number;
  unit?: string;
  material?: string;
  remarks?: string;
}

export interface ItpProject {
  id: string;
  projectName: string;
  workOrderId?: string;
  customerName?: string;
  version: string;
  status: 'active' | 'archived' | 'draft';
  description?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface ItpItem {
  id: string;
  projectId: string;
  bomItemId?: string; // Related BOM ID
  processStep: string; // Process/Step
  activity: string; // Inspection Activity
  referenceDoc: string; // Reference Doc
  acceptanceCriteria: string; // Acceptance Criteria
  controlPoint: 'H' | 'R' | 'S' | 'W'; // Control Point
  frequency: string; // Frequency
  verifyingDocument: string; // Verifying Document
  // Quantitative
  isQuantitative: boolean;
  // Old fields
  standardValue?: number;
  upperTolerance?: number;
  lowerTolerance?: number;
  unit?: string;

  // New array field
  quantitativeItems?: {
    id?: string;
    lowerTolerance: number;
    name?: string;
    standardValue: number;
    unit: string;
    upperTolerance: number;
  }[];

  // Linked info
  relatedKnowledgeId?: string;
  order: number;
}

export interface ItpTreeNode {
  id: string;
  type: 'item' | 'project';
  parentId?: string;
  bomItemId?: string;
  name: string;
  processStep?: string;
  controlPoint?: string;
  status?: string;
  version?: string;
  itemCount?: number;
  progress?: number;
  workOrderId?: string;
  workOrderNumber?: string;
  children?: ItpTreeNode[];
  activity?: string;
  referenceDoc?: string;
  acceptanceCriteria?: string;
  frequency?: string;
  verifyingDocument?: string;
  isQuantitative?: boolean;
  quantitativeItems?: {
    id?: string;
    lowerTolerance: number;
    name?: string;
    standardValue: number;
    unit: string;
    upperTolerance: number;
  }[];
  standardValue?: number;
  upperTolerance?: number;
  lowerTolerance?: number;
  unit?: string;
  relatedKnowledgeId?: string;
}
