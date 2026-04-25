export interface FeedbackItem {
  id: string;
  userEmail: string;
  userName: string;
  message: string;
  type: 'bug' | 'feature' | 'improvement' | 'feedback';
  status: 'pending' | 'planned' | 'in-progress' | 'fixed';
  createdAt: string;
  updatedAt: string;
}
