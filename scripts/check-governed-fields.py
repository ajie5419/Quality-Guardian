#!/usr/bin/env python3
"""Governed-field registration guard for newly added schema columns.

Reads ADDED column lines of apps/backend/prisma/schema.prisma (piped on stdin)
and cross-checks them against the governed-fields registry
(apps/backend/utils/master-data-fields.ts). A newly added column is flagged
when ALL of these hold:

  * its name ends with "Name" (or "Id" and pairs with a governed name column),
  * the same column name already exists in at least one OTHER table in the
    current schema (i.e. it is cross-table / reusable),
  * the column name is not already registered as a governed nameColumn for
    that table (a legit extension of an already-governed field),
  * the column is not an ambiguous generic (name/category/type) and the table
    is not an identity/alias/audit bookkeeping table.

This is an INCREMENTAL guard: only columns added in the current change are
considered, so pre-existing ungoverned columns never trip it.

Output: pipe-separated lines  rule|location|message
"""
import re
import sys

GENERIC_COLUMNS = {"name", "category", "type"}
# Bookkeeping / identity tables whose columns are not business governed names.
SKIP_TABLES = {
    "team_identity_aliases",
    "team_identity_name_keys",
    "team_identity_sources",
    "team_identity_merge_participants",
    "unresolved_master_data_refs",
    "historical_identity_resolutions",
    "identity_resolution_projection",
    "pass_rate_process_identity_projection",
    "supplier_score_snapshots",
    "daily_reports",
    "menus",
    "permissions",
    "rbac_permissions",
}

RULE = "B-GF"


def parse_args(argv):
    root = "."
    if "--root" in argv:
        idx = argv.index("--root")
        if idx + 1 < len(argv):
            root = argv[idx + 1]
    return root


def parse_schema_columns(schema_text):
    """model name -> set of column names."""
    models = {}
    current = None
    for line in schema_text.splitlines():
        m = re.match(r"^model (\w+) \{", line)
        if m:
            current = m.group(1)
            models.setdefault(current, set())
            continue
        if current and line.strip() == "}":
            current = None
            continue
        if current:
            cm = re.match(r"^\s+(\w+)\s", line)
            if cm:
                models[current].add(cm.group(1))
    return models


def parse_governed_targets(fields_source):
    """table -> set of governed nameColumn values."""
    targets = {}
    pattern = re.compile(
        r"table:\s*'([^']+)'[^}]*?nameColumn:\s*'([^']+)'"
    )
    for m in pattern.finditer(fields_source):
        table, name_col = m.groups()
        targets.setdefault(table, set()).add(name_col)
    return targets


def extract_added_columns(added_lines):
    """Return (table, column) pairs from added schema lines.

    Schema diffs appear as added lines like:
        +  supplierName       String?
    but the model header itself ('+model x {') tells us the table; we track
    the most recent model header seen in the added diff.
    """
    pairs = []
    current_table = None
    for line in added_lines:
        line = line.lstrip("+").strip()
        if not line:
            continue
        m = re.match(r"^model (\w+) \{", line)
        if m:
            current_table = m.group(1)
            continue
        if current_table:
            cm = re.match(r"^(\w+)\s", line)
            if cm:
                pairs.append((current_table, cm.group(1)))
    return pairs


def main():
    root = parse_args(sys.argv[1:])
    added_lines = [ln.rstrip("\n") for ln in sys.stdin if ln.strip()]

    schema_text = ""
    try:
        with open(f"{root}/apps/backend/prisma/schema.prisma", encoding="utf-8") as fh:
            schema_text = fh.read()
    except OSError:
        return

    fields_source = ""
    try:
        with open(
            f"{root}/apps/backend/utils/master-data-fields.ts", encoding="utf-8"
        ) as fh:
            fields_source = fh.read()
    except OSError:
        return

    all_models = parse_schema_columns(schema_text)
    governed = parse_governed_targets(fields_source)
    # Every governed name column across all targets (a governed-name vocabulary).
    governed_name_columns = {
        col for cols in governed.values() for col in cols
    }

    added = extract_added_columns(added_lines)
    for table, column in added:
        if column in GENERIC_COLUMNS:
            continue
        if table in SKIP_TABLES:
            continue
        # Only flag name-like columns (business name references).
        if not column.endswith("Name"):
            continue
        # Already governed for this table? -> legit extension.
        if column in governed.get(table, set()):
            continue
        if column in governed_name_columns:
            # Reusing a governed vocabulary column on a NEW (unregistered)
            # table -> the table must be added to that field's targets.
            print(
                f"{RULE}|apps/backend/prisma/schema.prisma:{table}.{column}|"
                f"Newly added column '{column}' in {table} reuses a governed "
                f"name field but the table is not registered in its targets in "
                f"apps/backend/utils/master-data-fields.ts — register the target."
            )
            continue
        # A brand-new name column that is cross-table (present in 2+ other
        # tables) must be registered as a new governed field.
        other_tables = [
            t for t, cols in all_models.items() if column in cols and t != table
        ]
        if len(other_tables) < 2:
            continue
        print(
            f"{RULE}|apps/backend/prisma/schema.prisma:{table}.{column}|"
            f"Newly added cross-table column '{column}' in {table} (also in "
            f"{','.join(sorted(other_tables)[:3])}) must be registered in "
            f"apps/backend/utils/master-data-fields.ts (governed-fields registry)."
        )


if __name__ == "__main__":
    main()
