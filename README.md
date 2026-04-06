# ts-import-sort-cli

Sort TypeScript/JavaScript import statements by groups (builtin, external, internal, relative).

## Install

```bash
npm install -g ts-import-sort-cli
```

## Usage

```bash
# Show unsorted imports (default)
ts-import-sort-cli

# Check if imports are sorted (exits with code 1 if not)
ts-import-sort-cli --check

# Sort imports in place
ts-import-sort-cli --write

# Preview changes without writing
ts-import-sort-cli --dry-run

# Custom glob pattern
ts-import-sort-cli --write -p "lib/**/*.{ts,tsx,js,jsx}"
```

## Import Groups

Imports are sorted into four groups, separated by blank lines:

1. **Node builtins** - `fs`, `path`, `node:crypto`, etc.
2. **External packages** - `react`, `lodash`, `commander`, etc.
3. **Internal aliases** - `@/utils`, `~/components`, etc.
4. **Relative imports** - `./foo`, `../bar`, etc.

Within each group, imports are sorted alphabetically by module specifier.

### Before

```typescript
import { useState } from "react";
import { resolve } from "node:path";
import { Button } from "@/components/Button";
import chalk from "chalk";
import { helper } from "./helper";
import { readFileSync } from "node:fs";
import { Config } from "../config";
```

### After

```typescript
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import chalk from "chalk";
import { useState } from "react";

import { Button } from "@/components/Button";

import { Config } from "../config";
import { helper } from "./helper";
```

## Options

| Flag | Description |
| --- | --- |
| `--check` | Check only, exit 1 if unsorted |
| `--write` | Modify files in place |
| `--dry-run` | Show changes without writing |
| `-p, --pattern <glob>` | Glob pattern (default: `src/**/*.{ts,tsx}`) |
| `-V, --version` | Show version |
| `-h, --help` | Show help |

## License

MIT
