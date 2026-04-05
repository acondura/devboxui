export const runtime = 'edge';

import { headers } from 'next/headers';
import { DashboardView } from '@/modules/access/components/DashboardView';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const headersList = await headers();
  const userEmail = headersList.get('x-user-email');

  if (!userEmail) {
    redirect('/');
  }

  return <DashboardView userEmail={userEmail} />;
}