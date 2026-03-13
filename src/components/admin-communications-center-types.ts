export type CommunicationCampaignSummary = {
  id: string;
  name: string;
  subject: string;
  status: string;
  createdAt: string;
  sentAt: string | null;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
};

export const EMPTY_COMMUNICATION_SUMMARY = {
  queued: 0,
  processing: 0,
  sent: 0,
  failed: 0,
  total: 0,
};
