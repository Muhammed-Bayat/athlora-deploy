import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    'welcome',
    {
      type: 'category',
      label: 'Getting Started',
      items: [
        'getting-started/frontend',
        'getting-started/backend',
        'getting-started/e2e',
        'getting-started/docs',
        'getting-started/scripts',
      ],
    },
    {
      type: 'category',
      label: 'Architecture',
      items: ['architecture/overview', 'tech-stack/stack'],
    },
    {
      type: 'category',
      label: 'Database',
      items: ['db-schema/overview', 'db-schema/results-derivation'],
    },
    {
      type: 'category',
      label: 'API Reference',
      items: ['api-reference/contract'],
    },
    {
      type: 'category',
      label: 'Project Process',
      items: [
        'process/project-methodology',
        'process/git-methodology',
        'process/agent-build-spec',
        'process/dev-plan',
        'process/roadmap',
      ],
    },
    {
      type: 'category',
      label: 'Sprint 1',
      items: ['sprint 1/Meetings', 'sprint 1/client meetings'],
    },
  ],
};

export default sidebars;
