import { headers } from 'next/headers';
import { DashboardView } from '@/modules/access/components/DashboardView';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  // Add 'await' here because Next.js 15 makes this async
  const headersList = await headers();
  const userEmail = headersList.get('x-user-email');

  // Hard-fail safeguard
  if (!userEmail) {
    redirect('/');
  }

  return <DashboardView userEmail={userEmail} />;
}