'use server';

import { getCloudflareEnv, getIdentity } from '@/lib/auth';
import { FeedbackItem } from './types';

/**
 * Submits new user feedback to KV.
 */
export async function submitFeedback(message: string, type: FeedbackItem['type']) {
  const userEmail = await getIdentity();
  const env = await getCloudflareEnv();
  const kv = env.KV;

  if (!kv) throw new Error("KV database missing.");

  const id = crypto.randomUUID();
  const userName = userEmail.split('@')[0];
  
  const feedback: FeedbackItem = {
    id,
    userEmail,
    userName,
    message,
    type,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // We store with a prefix that allows both listing all and specific user feedback
  await kv.put(`feedback:all:${id}`, JSON.stringify(feedback));
  await kv.put(`feedback:user:${userEmail}:${id}`, JSON.stringify(feedback));

  return { success: true };
}

/**
 * Retrieves all feedback for the public roadmap.
 */
export async function getRoadmap() {
  const env = await getCloudflareEnv();
  const kv = env.KV;

  if (!kv) return [];

  const list = await kv.list({ prefix: 'feedback:all:' });
  const feedback = await Promise.all(
    list.keys.map(async (key: { name: string }) => {
      const val = await kv.get(key.name);
      return val ? (JSON.parse(val) as FeedbackItem) : null;
    })
  );

  return feedback
    .filter((f): f is FeedbackItem => f !== null)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Updates the status of a feedback item (Admin only).
 */
export async function updateFeedbackStatus(id: string, userEmail: string, status: FeedbackItem['status']) {
  const adminEmail = await getIdentity();
  const env = await getCloudflareEnv();
  const kv = env.KV;

  if (!kv) throw new Error("KV database missing.");

  // Logic: Check if the current user is an admin (e.g. you)
  // For now we'll allow you to set your email in env or just hardcode for this demo
  const isAdmin = adminEmail === 'andrei@example.com' || adminEmail === (env as Record<string, unknown>).ADMIN_EMAIL;
  if (!isAdmin) throw new Error("Unauthorized.");

  // Update in both locations
  const raw = await kv.get(`feedback:all:${id}`);
  if (!raw) throw new Error("Feedback not found.");

  const feedback = JSON.parse(raw) as FeedbackItem;
  feedback.status = status;
  feedback.updatedAt = new Date().toISOString();

  await kv.put(`feedback:all:${id}`, JSON.stringify(feedback));
  await kv.put(`feedback:user:${userEmail}:${id}`, JSON.stringify(feedback));

  return { success: true };
}
