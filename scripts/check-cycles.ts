import { readFileSync, existsSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

type Graph = Map<string, Set<string>>;

const SRC_DIR = path.resolve(process.cwd(), 'src');
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

async function collectSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(entryPath)));
    } else if (EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      files.push(entryPath);
    }
  }

  return files;
}

function normalizeNode(filePath: string): string | null {
  const relative = path.relative(SRC_DIR, filePath);
  if (relative.startsWith('..')) {
    return null;
  }
  return relative.replace(/\\/g, '/');
}

function resolveImport(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) {
    return null;
  }

  const fromDir = path.dirname(fromFile);
  const resolved = path.resolve(fromDir, specifier);

  const candidateFiles: string[] = [];

  if (existsSync(resolved) && statSync(resolved).isFile()) {
    candidateFiles.push(resolved);
  }

  for (const ext of EXTENSIONS) {
    candidateFiles.push(`${resolved}${ext}`);
  }

  for (const ext of EXTENSIONS) {
    candidateFiles.push(path.join(resolved, `index${ext}`));
  }

  for (const candidate of candidateFiles) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return null;
}

function addEdge(graph: Graph, from: string, to: string) {
  if (!graph.has(from)) {
    graph.set(from, new Set());
  }
  graph.get(from)!.add(to);
}

function parseImports(filePath: string): string[] {
  const content = readFileSync(filePath, 'utf8');
  const edges: string[] = [];

  const importRegex = /import\s+(?:type\s+)?[^'";]*?from\s*['"]([^'"\\]+)['"];?|import\s*\(\s*['"]([^'"\\]+)['"]\s*\)/g;

  for (let match = importRegex.exec(content); match; match = importRegex.exec(content)) {
    const specifier = match[1] ?? match[2];
    const fullMatch = match[0];

    if (!specifier) {
      continue;
    }

    if (/^import\s+type\b/.test(fullMatch)) {
      continue;
    }

    const resolved = resolveImport(filePath, specifier);
    if (!resolved) {
      continue;
    }

    const normalized = normalizeNode(resolved);
    if (normalized) {
      edges.push(normalized);
    }
  }

  return edges;
}

function buildGraph(files: string[]): Graph {
  const graph: Graph = new Map();

  for (const file of files) {
    const fromNode = normalizeNode(file);
    if (!fromNode) {
      continue;
    }
    const imports = parseImports(file);
    for (const to of imports) {
      addEdge(graph, fromNode, to);
    }
  }

  return graph;
}

type TarjanState = {
  index: number;
  stack: string[];
  indices: Map<string, number>;
  lowlinks: Map<string, number>;
  onStack: Set<string>;
  components: string[][];
};

function strongConnect(node: string, graph: Graph, state: TarjanState) {
  state.indices.set(node, state.index);
  state.lowlinks.set(node, state.index);
  state.index += 1;
  state.stack.push(node);
  state.onStack.add(node);

  const neighbours = graph.get(node) ?? new Set();
  for (const neighbour of neighbours) {
    if (!state.indices.has(neighbour)) {
      strongConnect(neighbour, graph, state);
      state.lowlinks.set(
        node,
        Math.min(state.lowlinks.get(node)!, state.lowlinks.get(neighbour)!)
      );
    } else if (state.onStack.has(neighbour)) {
      state.lowlinks.set(
        node,
        Math.min(state.lowlinks.get(node)!, state.indices.get(neighbour)!)
      );
    }
  }

  if (state.lowlinks.get(node) === state.indices.get(node)) {
    const component: string[] = [];
    let w: string | undefined;
    do {
      w = state.stack.pop();
      if (!w) {
        break;
      }
      state.onStack.delete(w);
      component.push(w);
    } while (w !== node);
    if (component.length > 0) {
      state.components.push(component);
    }
  }
}

function findStronglyConnectedComponents(graph: Graph): string[][] {
  const state: TarjanState = {
    index: 0,
    stack: [],
    indices: new Map(),
    lowlinks: new Map(),
    onStack: new Set(),
    components: [],
  };

  for (const node of graph.keys()) {
    if (!state.indices.has(node)) {
      strongConnect(node, graph, state);
    }
  }

  return state.components.filter((component) => {
    if (component.length > 1) {
      return true;
    }
    const single = component[0];
    const neighbours = graph.get(single);
    return neighbours?.has(single) ?? false;
  });
}

function componentLabel(component: string[]): string {
  return component.map((node) => `- ${node}`).join('\n');
}

function isPriorityComponent(component: string[]): boolean {
  const priorityPatterns = [
    /entry\/initializeAthens/i,
    /environment\//i,
    /sky/i,
  ];
  return component.some((node) => priorityPatterns.some((pattern) => pattern.test(node)));
}

async function main() {
  const files = await collectSourceFiles(SRC_DIR);
  const graph = buildGraph(files);
  const components = findStronglyConnectedComponents(graph);

  if (components.length === 0) {
    console.log('No import cycles detected.');
    return;
  }

  console.log('Import cycles detected:');
  let priority = false;
  for (const component of components) {
    const label = componentLabel(component);
    const marker = isPriorityComponent(component) ? ' (priority)' : '';
    console.log(`\nCycle${marker}:\n${label}`);
    if (!priority && isPriorityComponent(component)) {
      priority = true;
    }
  }

  if (priority) {
    console.error('\nPriority cycles remain among initializeAthens/environment/sky modules.');
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Failed to analyze import graph:', error);
  process.exitCode = 1;
});

