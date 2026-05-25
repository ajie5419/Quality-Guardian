export interface QmsModuleContext {
  userContext?: {
    userId: string;
    username?: string;
  };
}

export interface QmsPrismaDelegate {
  count(args: { where?: Record<string, unknown> }): Promise<number>;
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
  delete?(args: { where: { id: string } }): Promise<unknown>;
  findFirst?(args: { where?: Record<string, unknown> }): Promise<unknown>;
  findMany(args: {
    orderBy?: Record<string, unknown>;
    where?: Record<string, unknown>;
  }): Promise<unknown[]>;
  findUnique?(args: { where: { id: string } }): Promise<unknown>;
  update(args: {
    data: Record<string, unknown>;
    where: { id: string };
  }): Promise<unknown>;
}

export interface QmsModuleGovernedField {
  configKey: string;
  field: string;
  idField?: string;
}

export interface QmsModuleDefinition {
  audit: {
    enabled: boolean;
    trackedFields?: string[];
  };
  dataScope: {
    applyWhere?: (
      where: Record<string, unknown>,
      ctx: QmsModuleContext,
    ) => Promise<Record<string, unknown>> | Record<string, unknown>;
    deptField?: string;
    strategy: 'dept' | 'none' | 'personal' | 'team';
    teamField?: string;
  };
  governedFields?: QmsModuleGovernedField[];
  name: string;
  prismaDelegate: QmsPrismaDelegate;
  schemas: {
    create: {
      parse(input: unknown): Record<string, unknown>;
    };
    list: {
      parse(input: unknown): Record<string, unknown>;
    };
    update: {
      parse(input: unknown): Record<string, unknown>;
    };
  };
  softDelete: boolean;
  workflow?: {
    initialState?: string;
  };
  whereBuilder?: (
    params: Record<string, unknown>,
    ctx: QmsModuleContext,
  ) => Promise<Record<string, unknown>> | Record<string, unknown>;
}
