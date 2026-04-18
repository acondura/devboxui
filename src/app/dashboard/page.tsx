export const runtime = 'edge';

import { headers } from 'next/headers';
import { DashboardView } from '@/modules/access/components/DashboardView';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const headersList = await headers();
  let userEmail = headersList.get('x-user-email');

  // Fallback for development or testing if Access is not yet configured
  if (!userEmail && process.env.NODE_ENV === 'development') {
    userEmail = 'dev-user@example.com';
  }

  if (!userEmail) {
    // If you want to force access for testing on production, comment out the redirect
    // or provide a hardcoded fallback here.
    redirect('/');
  }

  return <DashboardView userEmail={userEmail} />;
}