import type { Linter } from 'eslint';

import type { RestrictedSyntaxSelector } from './rule-options';

import { BASE_RESTRICTED_SYNTAX_SELECTORS } from './rule-options';

interface RestrictedImportPattern {
  group: string[];
  importNames?: string[];
  message: string;
}

const APP_RESTRICTED_IMPORT_PATTERNS: RestrictedImportPattern[] = [
  {
    group: ['#/api/*'],
    message:
      'The #/api package cannot be imported, please use the @core package itself',
  },
  {
    group: ['#/layouts/*'],
    message:
      'The #/layouts package cannot be imported, please use the @core package itself',
  },
  {
    group: ['#/locales/*'],
    message:
      'The #/locales package cannot be imported, please use the @core package itself',
  },
  {
    group: ['#/stores/*'],
    message:
      'The #/stores package cannot be imported, please use the @core package itself',
  },
];

const QMS_RESTRICTED_IMPORT_PATTERNS: RestrictedImportPattern[] = [
  ...APP_RESTRICTED_IMPORT_PATTERNS,
  {
    group: ['**/constants', '**/constants.ts'],
    importNames: ['STATUS_OPTIONS'],
    message:
      'Status options in QMS modules must come from dictionary APIs. Do not import local STATUS_OPTIONS constants.',
  },
  {
    group: [
      '#/views/qms/inspection/records/config',
      '../records/config',
      '../../records/config',
    ],
    importNames: ['getProcessOptions'],
    message:
      'QMS modules must not directly use the local getProcessOptions fallback list. Use dictionary options via useDictionaryOptions/mapDictionaryOptions helpers.',
  },
  {
    group: ['#/api/qms/enums'],
    message:
      'Use @qgs/shared directly in QMS view modules instead of #/api/qms/enums.',
  },
];

const BACKEND_AUDIT_SYNTAX_SELECTORS: RestrictedSyntaxSelector[] = [
  {
    message:
      'Audit log `details` cannot use template literals directly. Use `detailsTemplate` + `detailsVariables`, or `renderAuditTemplateText`.',
    selector:
      "Property[key.name='details'][value.type='TemplateLiteral'], Property[key.value='details'][value.type='TemplateLiteral']",
  },
  {
    message:
      'Do not pass raw `details` to recordAuditLog. Use `detailsTemplate` + `detailsVariables`.',
    selector:
      "CallExpression[callee.property.name='recordAuditLog'] Property[key.name='details'], CallExpression[callee.property.name='recordAuditLog'] Property[key.value='details']",
  },
  {
    message:
      'Do not pass raw `details` to recordBusinessAuditLog. Use `detailsTemplate` + `detailsVariables`.',
    selector:
      "CallExpression[callee.name='recordBusinessAuditLog'] Property[key.name='details'], CallExpression[callee.name='recordBusinessAuditLog'] Property[key.value='details']",
  },
];

const QMS_GOVERNANCE_SYNTAX_SELECTORS: RestrictedSyntaxSelector[] = [
  {
    message:
      'Legacy local status constants are not allowed in QMS modules. Use dictionary options via useDictionaryOptions.',
    selector:
      "VariableDeclarator[id.name='STATUS_OPTIONS'], VariableDeclarator[id.name='PROJECT_STATUS_OPTIONS'], VariableDeclarator[id.name='ISSUE_STATUS_OPTIONS']",
  },
  {
    message:
      'Do not use inline dictType literals in QMS modules. Use QMS_DICTIONARY_TYPE_KEYS from @qgs/shared.',
    selector: "Property[key.name='dictType'][value.type='Literal']",
  },
  {
    message:
      'Do not define local `LossSource` enum. Use `LOSS_SOURCE` from @qgs/shared.',
    selector: "TSEnumDeclaration[id.name='LossSource']",
  },
  {
    message:
      'Do not define local `LossType` enum. Use `LOSS_TYPE` from @qgs/shared.',
    selector: "TSEnumDeclaration[id.name='LossType']",
  },
  {
    message:
      'Do not define local `ClaimStatus` enum. Use `CLAIM_STATUS` from @qgs/shared.',
    selector: "TSEnumDeclaration[id.name='ClaimStatus']",
  },
  {
    message:
      'Do not define local `Severity` enum. Use `ISSUE_SEVERITY` from @qgs/shared.',
    selector: "TSEnumDeclaration[id.name='Severity']",
  },
  {
    message:
      'Do not define local `DeptType` enum. Use `ISSUE_DEPT_TYPE` from @qgs/shared.',
    selector: "TSEnumDeclaration[id.name='DeptType']",
  },
  {
    message:
      'Do not define local `DefectType` enum. Use `ISSUE_DEFECT_TYPE` from @qgs/shared.',
    selector: "TSEnumDeclaration[id.name='DefectType']",
  },
  {
    message:
      'Do not redefine local `LOSS_TYPE_OPTIONS`; use `QUALITY_LOSS_TYPE_OPTIONS` from @qgs/shared.',
    selector:
      "VariableDeclarator[id.name='LOSS_TYPE_OPTIONS'] > ArrayExpression.init",
  },
  {
    message:
      'Do not redefine local `QUALITY_LOSS_STATUS_FALLBACK_VALUES`; use `@qgs/shared` constants.',
    selector:
      "VariableDeclarator[id.name='QUALITY_LOSS_STATUS_FALLBACK_VALUES'] > ArrayExpression.init",
  },
  {
    message:
      'Do not redefine local `QUALITY_LOSS_STATUS_COLOR_MAP`; use `@qgs/shared` constants.',
    selector:
      "VariableDeclarator[id.name='QUALITY_LOSS_STATUS_COLOR_MAP'] > ObjectExpression.init",
  },
  {
    message:
      'Do not redefine local `SOURCE_STYLE_MAP`; use `QUALITY_LOSS_SOURCE_STYLE_MAP` from @qgs/shared.',
    selector:
      "VariableDeclarator[id.name='SOURCE_STYLE_MAP'] > ObjectExpression.init",
  },
  {
    message:
      'Do not define local `IMPORT_STATUS_MAP` in work-order constants. Use `mapWorkOrderStatus` from @qgs/shared as single source of truth.',
    selector:
      "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator[id.name='IMPORT_STATUS_MAP']",
  },
];

const restrictedImportIgnores = [
  '**/vite.config.mts',
  '**/tailwind.config.mjs',
  '**/postcss.config.mjs',
];

const customConfig: Linter.Config[] = [
  // shadcn-ui 内部组件是自动生成的，不做太多限制
  {
    files: ['packages/@core/ui-kit/shadcn-ui/**/**'],
    rules: {
      'vue/require-default-prop': 'off',
    },
  },
  {
    files: [
      'apps/**/**',
      'packages/effects/**/**',
      'packages/utils/**/**',
      'packages/types/**/**',
      'packages/locales/**/**',
    ],
    ignores: restrictedImportIgnores,
    rules: {
      'perfectionist/sort-interfaces': 'off',
      'perfectionist/sort-objects': 'off',
    },
  },
  {
    files: ['**/**.vue'],
    ignores: restrictedImportIgnores,
    rules: {
      'perfectionist/sort-objects': 'off',
    },
  },
  {
    // apps内部的一些基础规则
    files: ['apps/**/**'],
    ignores: restrictedImportIgnores,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: APP_RESTRICTED_IMPORT_PATTERNS,
        },
      ],
      'perfectionist/sort-interfaces': 'off',
    },
  },
  {
    // @core内部组件，不能引入@vben/* 里面的包
    files: ['packages/@core/**/**'],
    ignores: restrictedImportIgnores,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@vben/*'],
              message:
                'The @core package cannot import the @vben package, please use the @core package itself',
            },
          ],
        },
      ],
    },
  },
  {
    // @core/shared内部组件，不能引入@vben/* 或者 @vben-core/* 里面的包
    files: ['packages/@core/base/**/**'],
    ignores: restrictedImportIgnores,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@vben/*', '@vben-core/*'],
              message:
                'The @vben-core/shared package cannot import the @vben package, please use the @core/shared package itself',
            },
          ],
        },
      ],
    },
  },

  {
    // 不能引入@vben/*里面的包
    files: [
      'packages/types/**/**',
      'packages/utils/**/**',
      'packages/icons/**/**',
      'packages/constants/**/**',
      'packages/styles/**/**',
      'packages/stores/**/**',
      'packages/preferences/**/**',
      'packages/locales/**/**',
    ],
    ignores: restrictedImportIgnores,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@vben/*'],
              message:
                'The @vben package cannot be imported, please use the @core package itself',
            },
          ],
        },
      ],
    },
  },
  {
    // Keep base syntax restrictions when adding backend audit constraints.
    files: ['apps/backend/**/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...BASE_RESTRICTED_SYNTAX_SELECTORS,
        ...BACKEND_AUDIT_SYNTAX_SELECTORS,
      ],
    },
  },
  {
    // QMS governance restrictions are cumulative to avoid Flat Config overrides.
    files: ['apps/web-antd/src/views/qms/**/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: QMS_RESTRICTED_IMPORT_PATTERNS },
      ],
      'no-restricted-syntax': [
        'error',
        ...BASE_RESTRICTED_SYNTAX_SELECTORS,
        ...QMS_GOVERNANCE_SYNTAX_SELECTORS,
      ],
    },
  },
  {
    files: ['apps/web-antd/src/api/qms/enums.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...BASE_RESTRICTED_SYNTAX_SELECTORS,
        ...QMS_GOVERNANCE_SYNTAX_SELECTORS,
      ],
    },
  },
  // 后端模拟代码，不需要太多规则
  {
    files: ['apps/backend-mock/**/**', 'docs/**/**'],
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
      'n/no-extraneous-import': 'off',
      'n/prefer-global/buffer': 'off',
      'n/prefer-global/process': 'off',
      'no-console': 'off',
      'unicorn/prefer-module': 'off',
    },
  },
  {
    files: ['**/**/playwright.config.ts'],
    rules: {
      'n/prefer-global/buffer': 'off',
      'n/prefer-global/process': 'off',
      'no-console': 'off',
    },
  },
  {
    files: ['internal/**/**', 'scripts/**/**'],
    rules: {
      'no-console': 'off',
    },
  },
];

export { customConfig };
