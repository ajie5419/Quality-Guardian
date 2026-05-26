export interface ModuleMenuButtonDeclaration {
  authCode: string;
  name: string;
  order: number;
  title: string;
}

export interface ModuleMenuDeclaration {
  authCode?: null | string;
  buttons?: ModuleMenuButtonDeclaration[];
  component?: string;
  key: string;
  legacyNames?: string[];
  legacyPaths?: string[];
  meta: Record<string, unknown>;
  name: string;
  order?: number;
  parentPath?: string;
  path: string;
  redirect?: string;
  type: 'catalog' | 'menu';
}

export interface ModuleDataScopeDeclaration {
  deptFields: string[];
  selfFields: string[];
  selfFallsBackToDept?: boolean;
}

export interface ModuleAuditActionDeclaration {
  action: 'CREATE' | 'DELETE' | 'UPDATE' | string;
  detailsTemplate: string;
  targetType?: string;
}

export interface ModuleDeclaration {
  audit?: Record<string, ModuleAuditActionDeclaration>;
  dataScope?: ModuleDataScopeDeclaration;
  menus?: ModuleMenuDeclaration[];
  name: string;
}
