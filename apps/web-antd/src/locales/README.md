# locale

每个app使用的国际化可能不同，这里用于扩展国际化的功能，例如扩展 dayjs、antd组件库的多语言切换，以及app本身的国际化文件。

## Namespace Rules

- Locale files are organized by namespace: `src/locales/langs/<locale>/<namespace>.json`.
- All locales must keep the same namespace file set.
- Key parity is strict: key diffs are not allowed.
- Temporary/backup files are forbidden in locale directories:
  - `*.bak`
  - `*.bak2`
  - `*.bak3`
  - `*.tmp`
- Run `pnpm run check:i18n` before committing i18n changes.
