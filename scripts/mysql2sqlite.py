#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
# SPDX-License-Identifier: AGPL-3.0-or-later
"""
Convert a Nextcloud MariaDB/MySQL dump to a SQLite database file.

Usage: python3 scripts/mysql2sqlite.py <input.sql> <output.db>
"""

import re
import sqlite3
import sys


# --------------------------------------------------------------------------- #
# Patterns to skip entirely                                                   #
# --------------------------------------------------------------------------- #

SKIP_PATTERNS = re.compile(
    r'^('
    r'/\*.*?\*/\s*;?'            # inline comments like /*!...*/;
    r'|SET\s+@'                  # SET @OLD_AUTOCOMMIT etc.
    r'|SET\s+@@'                 # SET @@AUTOCOMMIT
    r'|SET\s+NAMES'              # SET NAMES utf8mb4
    r'|SET\s+TIME_ZONE'
    r'|LOCK\s+TABLES'
    r'|UNLOCK\s+TABLES'
    r'|/\*M!'                    # MariaDB-specific pragmas
    r'|--'                       # SQL comments
    r'|^\s*$'                    # blank lines
    r')',
    re.IGNORECASE,
)

# --------------------------------------------------------------------------- #
# Type mapping                                                                #
# --------------------------------------------------------------------------- #

TYPE_MAP = [
    (re.compile(r'\b(tiny|small|medium|big)?int\s*\(\d+\)\s*(unsigned)?', re.I), 'INTEGER '),
    (re.compile(r'\bbigint\b(\s*\(\d+\))?(\s*unsigned)?', re.I),                 'INTEGER '),
    (re.compile(r'\btinyint\b(\s*\(\d+\))?', re.I),                              'INTEGER '),
    (re.compile(r'\bsmallint\b(\s*\(\d+\))?', re.I),                             'INTEGER '),
    (re.compile(r'\bmediumint\b(\s*\(\d+\))?', re.I),                            'INTEGER '),
    (re.compile(r'\bvarchar\s*\(\d+\)', re.I),                                   'TEXT '),
    (re.compile(r'\bchar\s*\(\d+\)', re.I),                                      'TEXT '),
    (re.compile(r'\b(long|medium|tiny)?text\b', re.I),                           'TEXT '),
    (re.compile(r'\bblob\b', re.I),                                              'BLOB '),
    (re.compile(r'\b(long|medium|tiny)?blob\b', re.I),                           'BLOB '),
    (re.compile(r'\bdatetime\b', re.I),                                          'TEXT '),
    (re.compile(r'\btimestamp\b', re.I),                                         'TEXT '),
    (re.compile(r'\bdate\b', re.I),                                              'TEXT '),
    (re.compile(r'\btime\b', re.I),                                              'TEXT '),
    (re.compile(r'\bdouble\b(\s*\(\d+,\d+\))?', re.I),                          'REAL '),
    (re.compile(r'\bfloat\b(\s*\(\d+,\d+\))?', re.I),                           'REAL '),
    (re.compile(r'\bdecimal\b(\s*\(\d+,\d+\))?', re.I),                         'REAL '),
    (re.compile(r'\benum\s*\([^)]+\)', re.I),                                   'TEXT '),
    (re.compile(r'\bset\s*\([^)]+\)', re.I),                                    'TEXT '),
    (re.compile(r'\bjson\b', re.I),                                              'TEXT '),
]


def map_type(col_def: str) -> str:
    for pattern, replacement in TYPE_MAP:
        col_def = pattern.sub(replacement, col_def)
    return re.sub(r'\s+', ' ', col_def).strip()


def unquote_identifier(name: str) -> str:
    """Strip backtick quoting from an identifier."""
    return name.strip().strip('`')


def quote_identifier(name: str) -> str:
    return f'"{unquote_identifier(name)}"'


def transform_identifiers(sql: str) -> str:
    """Replace `backtick` quoted identifiers with "double-quote" ones."""
    return re.sub(r'`([^`]+)`', lambda m: f'"{m.group(1)}"', sql)


def strip_index_prefixes(cols: str) -> str:
    """Remove MySQL prefix-length suffixes like col(128) from index column lists."""
    return re.sub(r'(\w+"?)\s*\(\d+\)', r'\1', cols)


# --------------------------------------------------------------------------- #
# CREATE TABLE processing                                                     #
# --------------------------------------------------------------------------- #

def process_create_table(block: str) -> list[str]:
    """
    Convert a MySQL CREATE TABLE block to SQLite DDL statements.
    Returns a list of SQL strings to execute (CREATE TABLE + CREATE INDEX stmts).
    """
    # Extract table name
    m = re.match(r'CREATE\s+TABLE\s+`([^`]+)`\s*\(', block, re.I)
    if not m:
        return []
    table = m.group(1)

    # Extract the body between the outer parentheses
    start = block.index('(') + 1
    # Find matching closing paren (the one before ENGINE= or end)
    body = block[start:]
    # Strip the trailing ) ENGINE=... or just )
    body = re.sub(r'\)\s*(ENGINE|DEFAULT\s+CHARSET|AUTO_INCREMENT)[^;]*;?$', '', body, flags=re.I | re.DOTALL)
    body = body.rstrip().rstrip(')')

    col_lines = []
    index_stmts = []
    has_explicit_pk = False

    for raw_line in body.split('\n'):
        line = raw_line.strip().rstrip(',').strip()
        if not line:
            continue

        upper = line.upper()

        # Non-unique index → CREATE INDEX after the table
        if re.match(r'KEY\s+`', line, re.I) and not re.match(r'(UNIQUE|PRIMARY)\s+KEY', line, re.I):
            idx_m = re.match(r'KEY\s+`([^`]+)`\s*\((.+)\)', line, re.I)
            if idx_m:
                idx_name = idx_m.group(1)
                idx_cols = strip_index_prefixes(transform_identifiers(idx_m.group(2)))
                index_stmts.append(
                    f'CREATE INDEX IF NOT EXISTS "{table}_{idx_name}" ON "{table}" ({idx_cols});'
                )
            continue

        # UNIQUE KEY → inline UNIQUE constraint
        if re.match(r'UNIQUE\s+KEY', line, re.I):
            uk_m = re.match(r'UNIQUE\s+KEY\s+`([^`]+)`\s*\((.+)\)', line, re.I)
            if uk_m:
                uk_cols = strip_index_prefixes(transform_identifiers(uk_m.group(2)))
                col_lines.append(f'  UNIQUE ({uk_cols})')
            continue

        # PRIMARY KEY
        if re.match(r'PRIMARY\s+KEY', line, re.I):
            has_explicit_pk = True
            pk_m = re.match(r'PRIMARY\s+KEY\s*\((.+)\)', line, re.I)
            if pk_m:
                pk_cols = transform_identifiers(pk_m.group(1))
                col_lines.append(f'  PRIMARY KEY ({pk_cols})')
            continue

        # Column definition
        col_m = re.match(r'`([^`]+)`\s+(.*)', line)
        if col_m:
            col_name = col_m.group(1)
            col_rest = col_m.group(2)

            # Remove MySQL-only column modifiers SQLite doesn't understand
            col_rest = re.sub(r'\s*\bAUTO_INCREMENT\b\s*', ' ', col_rest, flags=re.I)
            col_rest = re.sub(r"\s+COMMENT\s+'(?:[^'\\]|\\.)*'", '', col_rest, flags=re.I)
            # Strip inline CHECK constraints — MariaDB adds CHECK (json_valid(...)) for
            # JSON columns. SQLite 3.38+ evaluates json_valid(NULL)=0 which causes every
            # INSERT that omits the column to fail the constraint check.
            # CHECK is always last in a MySQL column definition, so strip to end-of-string.
            col_rest = re.sub(r'\s+CHECK\s*\(.*', '', col_rest, flags=re.I | re.DOTALL)
            col_rest = col_rest.strip()

            # Map types
            col_rest = map_type(col_rest)

            col_lines.append(f'  "{col_name}" {col_rest}')

    if not col_lines:
        return []

    ddl = f'CREATE TABLE IF NOT EXISTS "{table}" (\n' + ',\n'.join(col_lines) + '\n);'
    return [ddl] + index_stmts


# --------------------------------------------------------------------------- #
# INSERT processing                                                           #
# --------------------------------------------------------------------------- #

def convert_mysql_string_escapes(sql: str) -> str:
    """
    Convert MySQL string escape sequences to SQLite equivalents.
    MySQL uses backslash escaping inside strings; SQLite does not.
    The critical case is \\' (escaped single quote) → '' (SQLite convention).
    We also handle \\\\ → \\ to avoid double-stripping.
    This runs a single pass through the SQL, only modifying content
    inside single-quoted literals.
    """
    result = []
    i = 0
    n = len(sql)
    in_string = False

    while i < n:
        ch = sql[i]

        if not in_string:
            result.append(ch)
            if ch == "'":
                in_string = True
            i += 1
            continue

        # Inside a single-quoted string
        if ch == '\\' and i + 1 < n:
            next_ch = sql[i + 1]
            if next_ch == "'":
                # \' → '' (escaped quote in MySQL → doubled quote in SQLite)
                result.append("''")
                i += 2
                continue
            elif next_ch == '\\':
                # \\ → keep as \\
                result.append('\\\\')
                i += 2
                continue
            else:
                # \n, \t, \r, \0 etc. — pass through as-is (SQLite treats them as
                # literal backslash + char, which is fine for screenshot data)
                result.append(ch)
                i += 1
                continue

        if ch == "'":
            result.append(ch)
            # Peek: '' is an escaped quote in SQLite — leave it, don't end string
            if i + 1 < n and sql[i + 1] == "'":
                result.append("'")
                i += 2
                continue
            in_string = False
            i += 1
            continue

        result.append(ch)
        i += 1

    return ''.join(result)


def transform_insert(stmt: str) -> str:
    stmt = transform_identifiers(stmt)
    stmt = convert_mysql_string_escapes(stmt)
    return stmt


# --------------------------------------------------------------------------- #
# Main conversion loop                                                        #
# --------------------------------------------------------------------------- #

def read_statements(sql_text: str):
    """
    Yield complete SQL statements from the dump text.
    Handles string literals and multi-line statements.
    """
    buf = []
    in_string = False
    string_char = None
    escaped = False

    i = 0
    while i < len(sql_text):
        ch = sql_text[i]

        if escaped:
            buf.append(ch)
            escaped = False
            i += 1
            continue

        if ch == '\\' and in_string:
            buf.append(ch)
            escaped = True
            i += 1
            continue

        if in_string:
            buf.append(ch)
            if ch == string_char:
                in_string = False
            i += 1
            continue

        if ch in ("'", '"'):
            in_string = True
            string_char = ch
            buf.append(ch)
            i += 1
            continue

        if ch == ';':
            buf.append(ch)
            stmt = ''.join(buf).strip()
            if stmt and stmt != ';':
                yield stmt
            buf = []
            i += 1
            continue

        buf.append(ch)
        i += 1


def convert(input_path: str, output_path: str) -> None:
    print(f'Reading {input_path}…')
    with open(input_path, encoding='utf-8', errors='replace') as f:
        sql_text = f.read()

    print('Parsing statements…')
    stmts = list(read_statements(sql_text))
    print(f'  Found {len(stmts)} statements')

    print(f'Opening {output_path}…')
    con = sqlite3.connect(output_path)
    con.execute('PRAGMA journal_mode=WAL')
    con.execute('PRAGMA foreign_keys=OFF')
    con.execute('PRAGMA synchronous=OFF')

    errors = 0
    skipped = 0
    tables = 0
    inserts = 0

    for stmt in stmts:
        first_line = stmt.split('\n')[0].strip()

        if SKIP_PATTERNS.match(first_line):
            skipped += 1
            continue

        upper = first_line.upper()

        if upper.startswith('CREATE TABLE'):
            sqlite_stmts = process_create_table(stmt)
            for s in sqlite_stmts:
                try:
                    con.execute(s)
                except sqlite3.Error as e:
                    print(f'  WARNING (CREATE TABLE): {e}\n  SQL: {s[:120]}', file=sys.stderr)
                    errors += 1
            if sqlite_stmts:
                tables += 1

        elif upper.startswith('INSERT INTO'):
            s = transform_insert(stmt)
            # INSERT OR IGNORE so rows that violate UNIQUE or CHECK constraints
            # are silently skipped rather than aborting the whole statement.
            s = re.sub(r'^INSERT\s+INTO\b', 'INSERT OR IGNORE INTO', s, count=1, flags=re.I)
            try:
                con.execute(s)
                inserts += 1
            except sqlite3.Error as e:
                print(f'  WARNING (INSERT): {e}\n  SQL: {s[:120]}', file=sys.stderr)
                errors += 1

        # Everything else (SET, LOCK, comments embedded in statements, etc.) → skip

    con.commit()
    con.close()

    print(f'Done: {tables} tables, {inserts} inserts, {errors} errors, {skipped} skipped')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(f'Usage: {sys.argv[0]} <input.sql> <output.db>', file=sys.stderr)
        sys.exit(1)
    convert(sys.argv[1], sys.argv[2])
