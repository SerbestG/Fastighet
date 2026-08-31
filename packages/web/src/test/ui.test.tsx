import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Banner, Field, Input, Pill, QueryBoundary, EmptyState, Tabs } from '../components/ui.js';
import { ApiError } from '../lib/api.js';

describe('Formulärfält', () => {
  it('kopplar etikett, hjälptext och felmeddelande till inmatningen', () => {
    render(
      <Field label="E-postadress" hint="Vi skickar bekräftelsen hit." error="Ange en giltig adress.">
        {({ id, describedBy, invalid }) => (
          <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} defaultValue="fel" />
        )}
      </Field>,
    );

    const input = screen.getByLabelText('E-postadress');
    expect(input).toHaveAttribute('aria-invalid', 'true');

    const described = (input.getAttribute('aria-describedby') ?? '').split(' ');
    const texts = described.map((id) => document.getElementById(id)?.textContent ?? '');
    expect(texts.join(' ')).toContain('Vi skickar bekräftelsen hit.');
    expect(texts.join(' ')).toContain('Ange en giltig adress.');
  });

  it('markerar frivilliga fält i etiketten i stället för bara med en asterisk', () => {
    render(
      <Field label="Telefonnummer" optional>
        {({ id }) => <Input id={id} />}
      </Field>,
    );
    expect(screen.getByText('(frivilligt)')).toBeTruthy();
  });

  it('felmeddelandet annonseras för skärmläsare', () => {
    render(
      <Field label="Namn" error="Fältet är obligatoriskt.">
        {({ id }) => <Input id={id} />}
      </Field>,
    );
    expect(screen.getByRole('alert').textContent).toContain('Fältet är obligatoriskt.');
  });
});

describe('Status', () => {
  it('statusen bärs av text, inte bara av färg', () => {
    render(<Pill tone="critical">Försenat</Pill>);
    expect(screen.getByText('Försenat')).toBeTruthy();
  });

  it('kritiska meddelanden annonseras direkt', () => {
    render(<Banner tone="critical" title="Vattnet är avstängt" />);
    expect(screen.getByRole('alert').textContent).toContain('Vattnet är avstängt');
  });
});

describe('Datahämtningens tillstånd', () => {
  const base = { data: null, error: null, loading: false, reload: () => {} };

  it('visar laddningsläge', () => {
    const { container } = render(
      <QueryBoundary state={{ ...base, loading: true }}>{() => <div>klart</div>}</QueryBoundary>,
    );
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
  });

  it('visar fel med spårnings-ID och möjlighet att försöka igen', async () => {
    const reload = vi.fn();
    render(
      <QueryBoundary
        state={{ ...base, error: new ApiError(500, 'internal_error', 'Ett tekniskt fel uppstod.', [], 'abc-123'), reload }}
      >
        {() => <div>klart</div>}
      </QueryBoundary>,
    );
    expect(screen.getByRole('alert').textContent).toContain('Ett tekniskt fel uppstod.');
    expect(screen.getByText(/abc-123/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Försök igen' }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('visar tomt läge när det inte finns något att visa', () => {
    render(
      <QueryBoundary
        state={{ ...base, data: { rows: [] } }}
        empty={{ when: (data) => data.rows.length === 0, render: <EmptyState title="Inga ärenden" body="Allt är lugnt." /> }}
      >
        {() => <div>lista</div>}
      </QueryBoundary>,
    );
    expect(screen.getByText('Inga ärenden')).toBeTruthy();
    expect(screen.queryByText('lista')).toBeNull();
  });

  it('visar innehållet när data finns', () => {
    render(
      <QueryBoundary state={{ ...base, data: { rows: [1] } }}>{(data) => <div>{data.rows.length} rad</div>}</QueryBoundary>,
    );
    expect(screen.getByText('1 rad')).toBeTruthy();
  });
});

describe('Flikar', () => {
  it('går att styra med tangentbordet och har rätt roller', async () => {
    const onChange = vi.fn();
    render(
      <Tabs
        label="Filtrera"
        active="open"
        onChange={onChange}
        tabs={[
          { value: 'open', label: 'Pågående', count: 2 },
          { value: 'closed', label: 'Avslutade', count: 5 },
        ]}
      />,
    );
    const list = screen.getByRole('tablist', { name: 'Filtrera' });
    const tabs = within(list).getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');

    await userEvent.tab();
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('closed');
  });
});
