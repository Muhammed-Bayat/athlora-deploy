import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { relative } from 'node:path';

const packages = [
  { name: 'Frontend', directory: 'frontend' },
  { name: 'Backend', directory: 'backend' },
];
const metricNames = ['statements', 'branches', 'functions', 'lines'];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function percent(metric) {
  if (!metric || metric.total === 0) return 'N/A';
  return `${((metric.covered / metric.total) * 100).toFixed(1)}%`;
}

function totalMetrics(summaries) {
  return Object.fromEntries(
    metricNames.map((name) => [
      name,
      summaries.reduce(
        (total, summary) => ({
          covered: total.covered + summary.total[name].covered,
          total: total.total + summary.total[name].total,
        }),
        { covered: 0, total: 0 },
      ),
    ]),
  );
}

function testResult(result) {
  const passed = result.numPassedTests ?? 0;
  const failed = result.numFailedTests ?? 0;
  const skipped = result.numPendingTests ?? 0;
  const files = result.testResults?.length ?? 'N/A';
  return {
    files,
    tests: `${passed} passed${skipped > 0 ? `, ${skipped} skipped` : ''}${failed > 0 ? `, ${failed} failed` : ''}`,
    status: failed === 0 ? 'Pass' : 'Fail',
  };
}

function lowCoverageFiles(directory, summary) {
  return Object.entries(summary)
    .filter(([path]) => path !== 'total')
    .map(([path, values]) => ({
      file: relative(process.cwd(), path),
      lines: values.lines,
      branches: values.branches,
      directory,
    }))
    .filter(({ lines }) => lines.total > 0)
    .sort((left, right) => left.lines.covered / left.lines.total - right.lines.covered / right.lines.total)
    .slice(0, 5);
}

const reports = packages.map(({ name, directory }) => {
  const summary = readJson(`${directory}/coverage/coverage-summary.json`);
  const testResults = readJson(`${directory}/coverage/test-results.json`);
  return { name, directory, summary, test: testResult(testResults) };
});
const combined = totalMetrics(reports.map(({ summary }) => summary));
const sha = (process.env.GITEA_SHA ?? process.env.GITHUB_SHA)?.slice(0, 7) ?? 'local';
const branch = process.env.GITEA_REF_NAME ?? process.env.GITHUB_REF_NAME ?? 'local';
const event = process.env.GITEA_EVENT_NAME ?? process.env.GITHUB_EVENT_NAME ?? 'local';
const lowCoverage = reports.flatMap(({ directory, summary }) => lowCoverageFiles(directory, summary));

const markdown = `# Athlora Quality Report

## Run Details

| Field | Value |
|---|---|
| Branch | \`${branch}\` |
| Commit | \`${sha}\` |
| Trigger | \`${event}\` |
| Generated | ${new Date().toISOString()} |

## Unit and API Test Results

| Package | Test files | Test result | Status |
|---|---:|---:|---|
${reports.map(({ name, test }) => `| ${name} | ${test.files} | ${test.tests} | **${test.status}** |`).join('\n')}

## Source Coverage

| Package | Statements | Branches | Functions | Lines |
|---|---:|---:|---:|---:|
${reports.map(({ name, summary }) => `| ${name} | ${percent(summary.total.statements)} | ${percent(summary.total.branches)} | ${percent(summary.total.functions)} | ${percent(summary.total.lines)} |`).join('\n')}
| **Combined** | **${percent(combined.statements)}** | **${percent(combined.branches)}** | **${percent(combined.functions)}** | **${percent(combined.lines)}** |

## Lowest-Covered Source Files

| Package | File | Lines | Branches |
|---|---|---:|---:|
${lowCoverage.map(({ directory, file, lines, branches }) => `| ${directory} | \`${file}\` | ${percent(lines)} | ${percent(branches)} |`).join('\n')}

## End-to-End Verification

The Playwright suite is tracked separately in the \`e2e\` Gitea Actions job because it verifies the running frontend, backend, database, authentication, desktop/mobile browser flows, and accessibility checks. It is credential-gated and is not included in source-line coverage.

## Downloadable Reports

- \`coverage-report.md\`: this summary.
- \`frontend/coverage/index.html\` and \`backend/coverage/index.html\`: interactive file and line coverage reports.
- \`frontend/coverage/lcov.info\` and \`backend/coverage/lcov.info\`: standard coverage data for future tooling.

Coverage is informational initially. Test failures still fail CI; a coverage threshold can be introduced after the baseline is established.
`;

mkdirSync('coverage', { recursive: true });
writeFileSync('coverage/coverage-report.md', markdown);

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

console.log(markdown);
