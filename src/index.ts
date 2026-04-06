import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import { glob } from "glob";

const NODE_BUILTINS = new Set([
  "assert",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "diagnostics_channel",
  "dns",
  "domain",
  "events",
  "fs",
  "http",
  "http2",
  "https",
  "inspector",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "stream",
  "string_decoder",
  "sys",
  "timers",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "zlib",
]);

interface ImportLine {
  raw: string;
  source: string;
}

type ImportGroup = "builtin" | "external" | "internal" | "relative";

function classifyImport(source: string): ImportGroup {
  const bare = source.replace(/^["']|["']$/g, "");

  if (bare.startsWith("node:") || NODE_BUILTINS.has(bare.split("/")[0])) {
    return "builtin";
  }
  if (bare.startsWith("@/") || bare.startsWith("~/")) {
    return "internal";
  }
  if (bare.startsWith("./") || bare.startsWith("../")) {
    return "relative";
  }
  return "external";
}

function parseImports(content: string): {
  imports: ImportLine[];
  rest: string;
} {
  const lines = content.split("\n");
  const imports: ImportLine[] = [];
  let lastImportIndex = -1;

  const importRegex =
    /^import\s+(?:(?:type\s+)?(?:\{[^}]*\}|[\w*]+(?:\s*,\s*\{[^}]*\})?)\s+from\s+)?['"]([^'"]+)['"]\s*;?\s*$/;
  const multiLineStartRegex = /^import\s+/;
  const fromRegex = /from\s+['"]([^'"]+)['"]\s*;?\s*$/;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "" || trimmed.startsWith("//")) {
      // Skip blank lines and comments at the top within the import block
      if (lastImportIndex === -1 && imports.length === 0) {
        imports.push({ raw: line, source: "" });
        i++;
        continue;
      }
      if (imports.length > 0 && lastImportIndex >= 0) {
        // Could be a blank line between import groups — peek ahead
        let nextNonBlank = i + 1;
        while (nextNonBlank < lines.length && lines[nextNonBlank].trim() === "") {
          nextNonBlank++;
        }
        if (
          nextNonBlank < lines.length &&
          lines[nextNonBlank].trim().startsWith("import ")
        ) {
          i++;
          continue;
        }
        break;
      }
      i++;
      continue;
    }

    const singleMatch = trimmed.match(importRegex);
    if (singleMatch) {
      imports.push({ raw: line, source: singleMatch[1] });
      lastImportIndex = i;
      i++;
      continue;
    }

    if (multiLineStartRegex.test(trimmed) && !trimmed.includes("from")) {
      // Multi-line import
      const multiLines = [line];
      i++;
      while (i < lines.length) {
        multiLines.push(lines[i]);
        const fromMatch = lines[i].match(fromRegex);
        if (fromMatch) {
          imports.push({
            raw: multiLines.join("\n"),
            source: fromMatch[1],
          });
          lastImportIndex = i;
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Not an import line — end of import block
    break;
  }

  // Filter out leading blank/comment lines that aren't real imports
  const realImports = imports.filter((imp) => imp.source !== "");
  const rest = lines.slice(i).join("\n");

  return { imports: realImports, rest };
}

function sortImports(imports: ImportLine[]): string {
  const groups: Record<ImportGroup, ImportLine[]> = {
    builtin: [],
    external: [],
    internal: [],
    relative: [],
  };

  for (const imp of imports) {
    const group = classifyImport(imp.source);
    groups[group].push(imp);
  }

  // Sort within each group alphabetically by source
  for (const key of Object.keys(groups) as ImportGroup[]) {
    groups[key].sort((a, b) => a.source.localeCompare(b.source));
  }

  const order: ImportGroup[] = ["builtin", "external", "internal", "relative"];
  const sections: string[] = [];

  for (const key of order) {
    if (groups[key].length > 0) {
      sections.push(groups[key].map((imp) => imp.raw).join("\n"));
    }
  }

  return sections.join("\n\n");
}

function processFile(filePath: string): { original: string; sorted: string } | null {
  const content = readFileSync(filePath, "utf-8");
  const { imports, rest } = parseImports(content);

  if (imports.length === 0) {
    return null;
  }

  const sortedImports = sortImports(imports);
  const sorted = sortedImports + "\n\n" + rest.replace(/^\n+/, "");
  const original = imports.map((i) => i.raw).join("\n") + "\n\n" + rest.replace(/^\n+/, "");

  if (original === sorted) {
    return null;
  }

  return { original: content, sorted };
}

function showDiff(filePath: string, original: string, sorted: string): void {
  const origLines = original.split("\n");
  const sortedLines = sorted.split("\n");

  console.log(chalk.bold(`\n--- ${filePath}`));

  const maxLines = Math.max(origLines.length, sortedLines.length);
  let inDiff = false;

  for (let i = 0; i < maxLines; i++) {
    const origLine = origLines[i];
    const sortedLine = sortedLines[i];

    if (origLine !== sortedLine) {
      if (!inDiff) {
        console.log(chalk.gray(`@@ line ${i + 1} @@`));
        inDiff = true;
      }
      if (origLine !== undefined) {
        console.log(chalk.red(`- ${origLine}`));
      }
      if (sortedLine !== undefined) {
        console.log(chalk.green(`+ ${sortedLine}`));
      }
    } else {
      inDiff = false;
    }
  }
}

const program = new Command();

program
  .name("ts-import-sort-cli")
  .description(
    "Sort TypeScript/JavaScript import statements by groups (builtin, external, internal, relative)"
  )
  .version("1.0.0")
  .option("--check", "Check if imports are sorted (exit 1 if not)")
  .option("--write", "Write sorted imports back to files")
  .option(
    "-p, --pattern <glob>",
    "Glob pattern for files to process",
    "src/**/*.{ts,tsx}"
  )
  .option("--dry-run", "Show changes without writing files")
  .action(async (options) => {
    const { check, write, pattern, dryRun } = options;

    const files = await glob(pattern, { absolute: true });

    if (files.length === 0) {
      console.log(chalk.yellow("No files matched the pattern: " + pattern));
      process.exit(0);
    }

    console.log(chalk.blue(`Processing ${files.length} file(s)...\n`));

    let unsortedCount = 0;
    let processedCount = 0;

    for (const file of files) {
      const relativePath = file.replace(resolve(".") + "/", "");
      const result = processFile(file);

      if (result === null) {
        continue;
      }

      unsortedCount++;
      processedCount++;

      if (check) {
        console.log(chalk.red(`  ✗ ${relativePath}`));
        showDiff(relativePath, result.original, result.sorted);
      } else if (dryRun) {
        console.log(chalk.yellow(`  ~ ${relativePath} (would change)`));
        showDiff(relativePath, result.original, result.sorted);
      } else if (write) {
        writeFileSync(file, result.sorted, "utf-8");
        console.log(chalk.green(`  ✓ ${relativePath} (sorted)`));
        showDiff(relativePath, result.original, result.sorted);
      } else {
        // Default: show diff only
        showDiff(relativePath, result.original, result.sorted);
      }
    }

    console.log();

    if (unsortedCount === 0) {
      console.log(chalk.green("All imports are already sorted."));
      process.exit(0);
    }

    if (check) {
      console.log(
        chalk.red(`${unsortedCount} file(s) have unsorted imports.`)
      );
      process.exit(1);
    }

    if (write) {
      console.log(chalk.green(`Sorted imports in ${processedCount} file(s).`));
    } else if (dryRun) {
      console.log(
        chalk.yellow(
          `${unsortedCount} file(s) would be changed. Use --write to apply.`
        )
      );
    } else {
      console.log(
        chalk.blue(
          `Found ${unsortedCount} file(s) with unsorted imports. Use --write to fix.`
        )
      );
    }
  });

program.parse();
