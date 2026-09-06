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
      items: ['db-schema/overview', 'db-schema/results-derivation', 'project-methodology/squad-migration'],
    },
    {
      type: 'category',
      label: 'API Reference',
      items: ['api-reference/contract', 'api-reference/comparison'],
    },
    {
      type: 'category',
      label: 'Project Methodology',
      items: [
        'project-methodology/methodology',
        'project-methodology/git-methodology',
        'project-methodology/agent-build-spec',
        'project-methodology/dev-plan',
        'project-methodology/delivery-roadmap',
      ],
    },
    {
      type: 'category',
      label: 'Sprints',
      items: [
        {
          type: 'category',
          label: 'Sprint 1',
          items: [
            'sprints/sprint-1/meeting-records',
            'sprints/sprint-1/client-meetings',
            'sprints/sprint-1/user-stories',
            'sprints/sprint-1/raw-meeting-transcript',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Legal',
      items: ['legal/privacy-policy', 'legal/terms'],
    },
  ],
};

export default sidebars;
