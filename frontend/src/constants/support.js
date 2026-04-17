export const SUPPORT_STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

export const SUPPORT_CATEGORY_OPTIONS = [
  { value: 'all', label: 'All Categories' },
  { value: 'general', label: 'General' },
  { value: 'claims', label: 'Claims' },
  { value: 'policy', label: 'Policy' },
  { value: 'payment', label: 'Payment' },
  { value: 'technical', label: 'Technical' },
  { value: 'account', label: 'Account' },
];

export const SUPPORT_CATEGORY_VALUE_TO_LABEL = SUPPORT_CATEGORY_OPTIONS.reduce((accumulator, option) => {
  if (option.value !== 'all') {
    accumulator[option.value] = option.label;
  }
  return accumulator;
}, {});

export const SUPPORT_STATUS_VALUE_TO_LABEL = SUPPORT_STATUS_OPTIONS.reduce((accumulator, option) => {
  if (option.value !== 'all') {
    accumulator[option.value] = option.label;
  }
  return accumulator;
}, {});
