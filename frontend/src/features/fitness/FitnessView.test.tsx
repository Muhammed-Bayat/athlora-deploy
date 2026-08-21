import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FitnessView } from './FitnessView';
import type { Injury, InjuryDraft } from './injuryRegions';

vi.mock('./BodyViewer', () => ({
  BodyViewer: ({ injuries, preview }: { injuries: Injury[]; preview: InjuryDraft | null }) => (
    <p>Body viewer: {injuries.length} saved; {preview ? `${preview.side} ${preview.area} ${preview.severity}` : 'no preview'}</p>
  ),
}));

function FitnessHarness() {
  const [injuries, setInjuries] = useState<Injury[]>([]);
  return <FitnessView
    athleteName="Ari Runner"
    athleteSquad="Sprint A"
    injuries={injuries}
    onAddInjury={(injury) => setInjuries((current) => [...current, injury])}
    onResolveInjury={(injuryId) => setInjuries((current) => current.filter((injury) => injury.id !== injuryId))}
    onBack={vi.fn()}
  />;
}

async function choose(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  await user.click(screen.getByRole('button', { name: label }));
  await user.click(screen.getByRole('option', { name: option }));
}

describe('FitnessView', () => {
  it('uses a page view with progressive controls and a live surface-preview payload', async () => {
    const user = userEvent.setup();
    render(<FitnessHarness />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '2. Specific area' })).not.toBeInTheDocument();
    await choose(user, '1. Body region', 'Leg');
    await choose(user, '2. Specific area', 'Knee');
    await choose(user, '3. Side', 'Left');
    await choose(user, '4. Severity', 'Severe · red');

    expect(screen.getByText('Body viewer: 0 saved; Left Knee Severe')).toBeInTheDocument();
    await choose(user, '1. Body region', 'Torso');
    expect(screen.getByRole('button', { name: '2. Specific area' })).toHaveTextContent('Select an area...');
    expect(screen.queryByRole('button', { name: '3. Side' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '4. Severity' })).not.toBeInTheDocument();
    expect(screen.getByText('Body viewer: 0 saved; no preview')).toBeInTheDocument();
    await choose(user, '1. Body region', 'Leg');
    await choose(user, '2. Specific area', 'Knee');
    await choose(user, '3. Side', 'Left');
    await choose(user, '4. Severity', 'Severe · red');
    await user.click(screen.getByRole('button', { name: 'Save injury' }));
    expect(screen.getByText('Body viewer: 1 saved; no preview')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Active injuries' })).toBeInTheDocument();
    expect(screen.getByText('Left Knee')).toBeInTheDocument();
  });

  it('supports multiple temporary injuries and resolves one without clearing the others', async () => {
    const user = userEvent.setup();
    render(<FitnessHarness />);

    await choose(user, '1. Body region', 'Leg');
    await choose(user, '2. Specific area', 'Knee');
    await choose(user, '3. Side', 'Left');
    await choose(user, '4. Severity', 'Severe · red');
    await user.click(screen.getByRole('button', { name: 'Save injury' }));
    await choose(user, '1. Body region', 'Arm');
    await choose(user, '2. Specific area', 'Shoulder');
    await choose(user, '3. Side', 'Right');
    await choose(user, '4. Severity', 'Moderate · orange');
    await user.click(screen.getByRole('button', { name: 'Save injury' }));

    expect(screen.getByText('Body viewer: 2 saved; no preview')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Resolve Left Knee injury' }));
    expect(screen.getByText('Body viewer: 1 saved; no preview')).toBeInTheDocument();
    expect(screen.getByText('Right Shoulder')).toBeInTheDocument();
  });

  it('uses a centre-side value without exposing side controls for torso regions', async () => {
    const user = userEvent.setup();
    render(<FitnessHarness />);

    await choose(user, '1. Body region', 'Torso');
    await choose(user, '2. Specific area', 'Chest');

    expect(screen.queryByRole('button', { name: '3. Side' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '4. Severity' })).toBeInTheDocument();
    await choose(user, '4. Severity', 'Severe · red');
    expect(screen.getByText('Body viewer: 0 saved; Center Chest Severe')).toBeInTheDocument();
  });
});
