export const runtime = 'edge';

import { headers } from 'next/headers';
import { DashboardView } from '@/modules/access/components/DashboardView';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const headersList = await headers();
  // Check both common Cloudflare Access header names
  let userEmail = headersList.get('x-user-email') || 
                  headersList.get('cf-access-authenticated-user-email');

  // Fallback for development or testing if Access is not yet configured
  if (!userEmail && process.env.NODE_ENV === 'development') {
    userEmail = 'dev-user@example.com';
  }

  if (!userEmail) {
    // If we still don't have an email after login, redirect to home
    redirect('/');
  }

  return <DashboardView userEmail={userEmail} />;
}