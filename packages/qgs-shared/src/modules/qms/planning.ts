// DFMEA Project
export interface DfmeaProject {
  createdAt: Date;
  createdBy: string;
  description?: string;
  id: string;
  projectName: string;
  status: 'active' | 'archived' | 'draft';
  updatedAt: Date;
  version: string;
  workOrderId?: string;
  workOrderNumber?: string;
}

// DFMEA Item
export interface DfmeaItem {
  detection: number;
  effects: string;
  failureMode: string;
  function: string;
  id: string;
  item: string;
  occurrence: number;
  order: number;
  projectId: string;
  rpn: number;
  severity: number;
}

// DFMEA Tree Node
export interface DfmeaTreeNode {
  avgRpn?: number;
  children?: DfmeaTreeNode[];
  detection?: number;
  effects?: string;
  failureMode?: string;
  id: string;
  // Project stats
  itemCount?: number;
  maxRpn?: number;
  name: string;
  occurrence?: number;
  order?: number;
  parentId?: string;
  projectName?: string;
  riskLevel?: 'high' | 'low' | 'medium';
  rpn?: number;
  severity?: number;
  status?: string;
  type: 'item' | 'project';
  // Project info
  version?: string;
}

// DFMEA Project Stats
export interface DfmeaProjectStats {
  avgRpn: number;
  highRiskCount: number; // RPN > 100
  itemCount: number;
  lowRiskCount: number; // RPN <= 50
  maxRpn: number;
  mediumRiskCount: number; // 50 < RPN <= 100
  projectId: string;
  projectName: string;
}

export interface BomProject {
  createdAt: string;
  createdBy: string;
  description?: string;
  id: string;
  projectName: string;
  status: 'active' | 'archived' | 'draft';
  updatedAt: string;
  version: string;
  workOrderNumber: string;
}

export interface BomItem {
  id: string;
  material: string;
  partName: string;
  partNumber: string;
  projectId: string;
  quantity: number;
  remarks?: string;
  unit: string;
  version: string;
}

export interface BomTreeNode {
  children?: BomTreeNode[];
  id: string;
  itemCount?: number;
  material?: string;
  name: string;
  parentId?: string;
  // Item specific
  partNumber?: string;
  projectName?: string;
  quantity?: number;
  remarks?: string;
  status?: string;
  type: 'item' | 'project';
  unit?: string;
  version?: string;
  workOrderNumber?: string;
}

export interface ItpProject {
  createdAt: string;
  createdBy: string;
  customerName?: string;
  description?: string;
  id: string;
  projectName: string;
  status: 'active' | 'archived' | 'draft';
  updatedAt: string;
  version: string;
  workOrderId?: string;
  workOrderNumber?: string;
}

export interface ItpItem {
  acceptanceCriteria: string; // Acceptance Criteria
  activity: string; // Inspection Activity
  bomItemId?: string; // Related BOM ID
  controlPoint: 'H' | 'R' | 'S' | 'W'; // Control Point
  frequency: string; // Frequency
  id: string;
  // Quantitative
  isQuantitative: boolean;
  lowerTolerance?: number;
  order: number;
  processStep: string; // Process/Step
  projectId: string;
  // New array field
  quantitativeItems?: {
    id?: string;
    lowerTolerance: number;
    name?: string;
    standardValue: number;
    unit: string;
    upperTolerance: number;
  }[];
  referenceDoc: string; // Reference Doc
  // Linked info
  relatedKnowledgeId?: string;
  // Old fields
  standardValue?: number;

  unit?: string;

  upperTolerance?: number;
  verifyingDocument: string; // Verifying Document
}

export interface ItpTreeNode {
  acceptanceCriteria?: string;
  activity?: string;
  bomItemId?: string;
  children?: ItpTreeNode[];
  controlPoint?: string;
  frequency?: string;
  id: string;
  isQuantitative?: boolean;
  itemCount?: number;
  lowerTolerance?: number;
  name: string;
  parentId?: string;
  processStep?: string;
  progress?: number;
  quantitativeItems?: {
    id?: string;
    lowerTolerance: number;
    name?: string;
    standardValue: number;
    unit: string;
    upperTolerance: number;
  }[];
  referenceDoc?: string;
  relatedKnowledgeId?: string;
  standardValue?: number;
  status?: string;
  type: 'item' | 'project';
  unit?: string;
  upperTolerance?: number;
  verifyingDocument?: string;
  version?: string;
  workOrderId?: string;
  workOrderNumber?: string;
}
