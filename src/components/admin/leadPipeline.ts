/**
 * The pipeline's stages, shared by the desktop board and the phone board.
 *
 * In their own module rather than exported from LeadPipelineBoard: a file
 * that exports both components and constants breaks React Fast Refresh, and
 * two boards now import these.
 */
export const PIPELINE_COLUMNS = [
  { id: 'new', label: 'New', color: 'bg-info', borderColor: 'border-t-info' },
  { id: 'follow_up', label: 'Follow Up', color: 'bg-warning', borderColor: 'border-t-warning' },
  { id: 'quoted', label: 'Quoted', color: 'bg-purple-500', borderColor: 'border-t-purple-500' },
  { id: 'converted', label: 'Converted', color: 'bg-success', borderColor: 'border-t-success' },
  { id: 'lost', label: 'Lost', color: 'bg-destructive', borderColor: 'border-t-destructive' },
];
