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

type RestrictedProperty = {
  message: string;
  object?: string;
  property: string;
};

const BASE_RESTRICTED_PROPERTIES: RestrictedProperty[] = [
  {
    message: 'Use `Object.getPrototypeOf` or `Object.setPrototypeOf` instead.',
    property: '__proto__',
  },
  {
    message: 'Use `Object.defineProperty` instead.',
    property: '__defineGetter__',
  },
  {
    message: 'Use `Object.defineProperty` instead.',
    property: '__defineSetter__',
  },
  {
    message: 'Use `Object.getOwnPropertyDescriptor` instead.',
    property: '__lookupGetter__',
  },
  {
    message: 'Use `Object.getOwnPropertyDescriptor` instead.',
    property: '__lookupSetter__',
  },
];

export { BASE_RESTRICTED_PROPERTIES, BASE_RESTRICTED_SYNTAX_SELECTORS };
export type { RestrictedProperty, RestrictedSyntaxSelector };
