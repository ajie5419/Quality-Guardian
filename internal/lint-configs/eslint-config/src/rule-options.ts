type RestrictedSyntaxSelector =
  | string
  | {
      message: string;
      selector: string;
    };

const BASE_RESTRICTED_SYNTAX_SELECTORS: RestrictedSyntaxSelector[] = [
  'DebuggerStatement',
  'LabeledStatement',
  'WithStatement',
  'TSEnumDeclaration[const=true]',
  'TSExportAssignment',
];

export { BASE_RESTRICTED_SYNTAX_SELECTORS };
export type { RestrictedSyntaxSelector };
