import { appendFileSync, readFileSync } from 'node:fs';

const packages = [
  { name: 'Frontend', directory: 'frontend' },
  { name: 'Backend', directory: 'backend' },
];
const metrics = ['lines', 'branches', 'functions'];

function readSummary(directory) {
  return JSON.parse(readFileSync(`${directory}/coverage/coverage-summary.json`, 'utf8')).total;
}

function percent(metric) {
  if (metric.total === 0) return 'N/A';
  return `${((metric.covered / metric.total) * 100).toFixed(1)}%`;
}

const reports = packages.map(({ name, directory }) => ({ name, total: readSummary(directory) }));
const combined = Object.fromEntries(
  metrics.map((metric) => [
    metric,
    reports.reduce(
      (total, report) => ({
        covered: total.covered + report.total[metric].covered,
        total: total.total + report.total[metric].total,
      }),
      { covered: 0, total: 0 },
    ),
  ]),
);
const sha = (process.env.GITEA_SHA ?? process.env.GITHUB_SHA)?.slice(0, 7) ?? 'local';

const markdown = `# Coverage

| Area | Lines | Branches | Functions |
|---|---:|---:|---:|
${reports.map(({ name, total }) => `| ${name} | ${percent(total.lines)} | ${percent(total.branches)} | ${percent(total.functions)} |`).join('\n')}
| **Combined** | **${percent(combined.lines)}** | **${percent(combined.branches)}** | **${percent(combined.functions)}** |

Commit: \`${sha}\`. Coverage is informational.`;

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

console.log(markdown);
