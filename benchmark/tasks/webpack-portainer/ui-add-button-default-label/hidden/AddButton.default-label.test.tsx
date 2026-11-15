// Hidden check (copied in by the checker, removed afterwards). Not shown to the agent.
import { UIView } from '@uirouter/react';
import { render } from '@testing-library/react';

import { withTestRouter } from '@/react/test-utils/withRouter';

import { AddButton } from '../AddButton';

function renderButton(children?: string) {
  const Wrapped = withTestRouter(AddButton, {
    stateConfig: [
      {
        name: 'root',
        url: '/',
        component: () => (
          <>
            <div>Root</div>
            <UIView />
          </>
        ),
      },
      { name: 'root.new', url: 'new' },
    ],
    route: 'root',
  });
  return render(
    <Wrapped to="" data-cy="bench-add-button">
      {children}
    </Wrapped>
  );
}

test('defaults to "Create" when no label is given', async () => {
  const { findByText, queryByText } = renderButton();
  expect(await findByText('Create')).toBeTruthy();
  expect(queryByText('Add')).toBeNull();
});

test('keeps an explicit label', async () => {
  const { findByText } = renderButton('Add stack');
  expect(await findByText('Add stack')).toBeTruthy();
});
