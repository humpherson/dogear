import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { QuoteForm } from '../components/quotes/QuoteForm';

it('saves a simple quotation without opening optional details', async () => {
  const submit = vi.fn();
  render(<QuoteForm collection onSubmit={submit} pending={false} />);
  expect(screen.getByLabelText(/Author or speaker/)).not.toBeVisible();
  await userEvent.type(
    screen.getByLabelText('The words you want to keep'),
    'A passing thought.',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Keep this quote' }),
  );
  await waitFor(() => expect(submit).toHaveBeenCalled());
  expect(submit.mock.calls[0][0]).toMatchObject({
    text: 'A passing thought.',
    page_number: '',
    note: '',
  });
});
it('keeps attribution and reference drafts when the details are collapsed and saved', async () => {
  const submit = vi.fn();
  render(<QuoteForm collection onSubmit={submit} pending={false} />);
  const toggle = screen.getByText('Add attribution and details');
  await userEvent.click(toggle);
  await userEvent.type(screen.getByLabelText(/Author or speaker/), 'A friend');
  await userEvent.type(screen.getByLabelText(/Reference/), 'Verse xiv');
  await userEvent.type(
    screen.getByLabelText('The words you want to keep'),
    'Words from anywhere.',
  );
  await userEvent.click(toggle);
  expect(screen.getByLabelText(/Reference/)).not.toBeVisible();
  await userEvent.click(
    screen.getByRole('button', { name: 'Keep this quote' }),
  );
  await waitFor(() => expect(submit).toHaveBeenCalled());
  expect(submit.mock.calls[0][0]).toMatchObject({
    credit_author: 'A friend',
    page_number: 'Verse xiv',
  });
});
it('reveals existing details when editing and reopens hidden validation errors', async () => {
  render(
    <QuoteForm
      onSubmit={vi.fn()}
      pending={false}
      initial={{
        text: 'Existing words',
        note: 'A'.repeat(5001),
        page_number: '42',
      }}
    />,
  );
  expect(screen.getByLabelText(/Page or location/)).toBeVisible();
  await userEvent.click(screen.getByText('Add details'));
  expect(screen.getByLabelText(/A note to yourself/)).not.toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(
    await screen.findByText('Use at most 5,000 characters.'),
  ).toBeVisible();
  expect(screen.getByLabelText(/A note to yourself/)).toBeVisible();
  expect(screen.getByLabelText(/A note to yourself/)).toHaveFocus();
});
